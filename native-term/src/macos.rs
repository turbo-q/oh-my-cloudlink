//! macOS NSView terminal host embedded into Electron's content view.
//!
//! AppKit touches always hop to the main queue. The host state is behind a mutex and
//! holds the view as a raw pointer so the napi/Electron threads stay `Send`.

use alacritty_terminal::event::{Event, EventListener};
use alacritty_terminal::grid::{Dimensions, Scroll};
use alacritty_terminal::index::{Column, Point};
use alacritty_terminal::term::{
  point_to_viewport, viewport_to_point, Config, Term, TermMode,
};
use alacritty_terminal::vte::ansi::{Color as AnsiColor, NamedColor, Processor as AnsiProcessor};
use dispatch2::{DispatchQueue, DispatchRetained, DispatchQueueAttr};
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{define_class, msg_send, ClassType, DeclaredClass, MainThreadMarker};
use objc2_app_kit::{NSColor, NSEvent, NSFont, NSView, NSWindowOrderingMode};
use objc2_foundation::{ns_string, NSPoint, NSRect, NSSize, NSString};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::Arc;

pub type InputEmitter = Arc<dyn Fn(String, String) + Send + Sync>;

struct NullListener;
impl EventListener for NullListener {
  fn send_event(&self, _event: Event) {}
}

struct TermSession {
  term: Term<NullListener>,
  parser: AnsiProcessor,
}

impl TermSession {
  fn new(cols: u32, rows: u32) -> Self {
    let size = TermSize {
      columns: cols as usize,
      screen_lines: rows as usize,
    };
    let term = Term::new(Config::default(), &size, NullListener);
    Self {
      term,
      parser: AnsiProcessor::new(),
    }
  }
}

#[derive(Clone, Copy)]
struct TermSize {
  columns: usize,
  screen_lines: usize,
}

impl Dimensions for TermSize {
  fn total_lines(&self) -> usize {
    self.screen_lines
  }
  fn screen_lines(&self) -> usize {
    self.screen_lines
  }
  fn columns(&self) -> usize {
    self.columns
  }
}

struct HostInner {
  /// `Retained<TermView>` stored as pointer; only used on AppKit main thread.
  view: Option<NonNull<TermView>>,
  sessions: HashMap<String, TermSession>,
  active: Option<String>,
  cell_width: f64,
  cell_height: f64,
  emitter: InputEmitter,
  theme: ThemePalette,
  sel_anchor: Option<CellPos>,
  sel_end: Option<CellPos>,
  selecting: bool,
  search_match: Option<(CellPos, CellPos)>,
  /// Dragging the scrollbar thumb.
  scrollbar_drag: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CellPos {
  col: usize,
  row: usize,
}

impl CellPos {
  fn clamp(self, cols: usize, rows: usize) -> Self {
    Self {
      col: self.col.min(cols.saturating_sub(1)),
      row: self.row.min(rows.saturating_sub(1)),
    }
  }
}

#[derive(Clone)]
pub struct ThemePalette {
  pub background: (f64, f64, f64),
  pub foreground: (f64, f64, f64),
  pub cursor: (f64, f64, f64),
  pub black: (f64, f64, f64),
  pub red: (f64, f64, f64),
  pub green: (f64, f64, f64),
  pub yellow: (f64, f64, f64),
  pub blue: (f64, f64, f64),
  pub magenta: (f64, f64, f64),
  pub cyan: (f64, f64, f64),
  pub white: (f64, f64, f64),
}

impl Default for ThemePalette {
  fn default() -> Self {
    // Match src/theme.ts dark terminal defaults.
    Self {
      background: hex_rgb("#0f1117"),
      foreground: hex_rgb("#e2e8f0"),
      cursor: hex_rgb("#10b981"),
      black: hex_rgb("#1e293b"),
      red: hex_rgb("#f87171"),
      green: hex_rgb("#34d399"),
      yellow: hex_rgb("#fbbf24"),
      blue: hex_rgb("#60a5fa"),
      magenta: hex_rgb("#c084fc"),
      cyan: hex_rgb("#22d3ee"),
      white: hex_rgb("#f1f5f9"),
    }
  }
}

fn hex_rgb(hex: &str) -> (f64, f64, f64) {
  parse_hex_rgb(hex)
}

pub fn parse_hex_rgb(hex: &str) -> (f64, f64, f64) {
  let h = hex.trim_start_matches('#');
  if h.len() < 6 {
    return (0.0, 0.0, 0.0);
  }
  let parse = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0) as f64 / 255.0;
  (parse(0), parse(2), parse(4))
}

// Safety: AppKit access is serialized onto the main queue; pointer is only
// dereferenced there. Sessions map is mutex-protected.
unsafe impl Send for HostInner {}
unsafe impl Sync for HostInner {}

pub struct NativeTermHost {
  inner: Arc<Mutex<HostInner>>,
}

fn on_main<R: Send>(f: impl FnOnce() -> R + Send) -> R {
  if MainThreadMarker::new().is_some() {
    return f();
  }
  let result = Arc::new(Mutex::new(None::<R>));
  let slot = Arc::clone(&result);
  DispatchQueue::main().exec_sync(move || {
    *slot.lock() = Some(f());
  });
  let out = result.lock().take().expect("main queue callback");
  out
}

impl NativeTermHost {
  pub fn attach(handle: &[u8], emitter: InputEmitter) -> Result<Self, String> {
    if handle.len() < std::mem::size_of::<usize>() {
      return Err("invalid native window handle".into());
    }
    let mut ptr_bits = 0usize;
    for (i, b) in handle[..std::mem::size_of::<usize>()].iter().enumerate() {
      ptr_bits |= (*b as usize) << (8 * i);
    }
    if ptr_bits == 0 {
      return Err("null native window handle".into());
    }

    let content_ptr = ptr_bits;
    let inner = Arc::new(Mutex::new(HostInner {
      view: None,
      sessions: HashMap::new(),
      active: None,
      cell_width: 8.0,
      cell_height: 16.0,
      emitter,
      theme: ThemePalette::default(),
      sel_anchor: None,
      sel_end: None,
      selecting: false,
      search_match: None,
      scrollbar_drag: false,
    }));
    let host_for_view = Arc::clone(&inner);

    on_main(move || -> Result<(), String> {
      let mtm =
        MainThreadMarker::new().ok_or_else(|| "AppKit requires main thread".to_string())?;
      let content_view: &NSView = unsafe {
        let p = content_ptr as *mut NSView;
        if p.is_null() {
          return Err("null NSView from Electron handle".into());
        }
        &*p
      };

      let font = NSFont::monospacedSystemFontOfSize_weight(13.0, 0.0);
      let cell_height = {
        let h = font.ascender() - font.descender() + font.leading();
        if h > 1.0 {
          h
        } else {
          16.0
        }
      };
      // Never call invented selectors on NSFont (e.g. sizeOfString:) — that
      // raises NSInvalidArgumentException and kills Electron before JS fallback.
      let cell_width = {
        let adv = font.maximumAdvancement();
        if adv.width > 1.0 {
          adv.width
        } else {
          (font.pointSize() * 0.6).max(6.0)
        }
      };

      let view = TermView::new(mtm, Arc::clone(&host_for_view));
      unsafe {
        view.setWantsLayer(true);
        // Do not stretch with superview — renderer owns bounds via setBounds.
        view.setAutoresizingMask(objc2_app_kit::NSAutoresizingMaskOptions::empty());
        view.setHidden(true);
        view.setFrame(NSRect::new(
          NSPoint::new(0.0, 0.0),
          NSSize::new(1.0, 1.0),
        ));
        content_view.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Above, None);
      }

      let mut guard = host_for_view.lock();
      guard.cell_width = cell_width;
      guard.cell_height = cell_height;
      guard.view = Some(NonNull::from(&*view));
      // Leak a retain so the view outlives the local Retained.
      std::mem::forget(view);
      Ok(())
    })?;

    Ok(Self { inner })
  }

  pub fn destroy(self) {
    let inner = Arc::clone(&self.inner);
    on_main(move || {
      let mut guard = inner.lock();
      guard.sessions.clear();
      guard.active = None;
      if let Some(ptr) = guard.view.take() {
        let view = unsafe { ptr.as_ref() };
        unsafe {
          view.removeFromSuperview();
        }
        // Drop one retain from attach's forget.
        unsafe {
          let _ : Retained<TermView> = Retained::from_raw(ptr.as_ptr()).unwrap();
        }
      }
    });
  }

  pub fn set_bounds(&self, x: f64, y: f64, width: f64, height: f64, _scale_factor: f64) {
    let inner = Arc::clone(&self.inner);
    on_main(move || {
      let guard = inner.lock();
      let Some(ptr) = guard.view else { return };
      let view = unsafe { ptr.as_ref() };
      let w = width.max(1.0);
      let h = height.max(1.0);
      // CSS getBoundingClientRect is top-left in the web view.
      // Frame origin is in the superview's coordinate system (usually bottom-left).
      let frame = unsafe {
        let superview = view.superview();
        let host_h = superview
          .as_ref()
          .map(|v| v.bounds().size.height)
          .unwrap_or(h + y);
        let superview_flipped = superview
          .as_ref()
          .map(|v| v.isFlipped())
          .unwrap_or(false);
        let origin_y = if superview_flipped {
          y
        } else {
          host_h - y - h
        };
        NSRect::new(NSPoint::new(x, origin_y), NSSize::new(w, h))
      };
      unsafe {
        view.setFrame(frame);
        view.setNeedsDisplay(true);
      }
    });
  }

  pub fn set_visible(&self, visible: bool) {
    let inner = Arc::clone(&self.inner);
    on_main(move || {
      let guard = inner.lock();
      if let Some(ptr) = guard.view {
        unsafe {
          ptr.as_ref().setHidden(!visible);
        }
      }
    });
  }

  pub fn focus(&self) {
    let inner = Arc::clone(&self.inner);
    on_main(move || {
      let guard = inner.lock();
      if let Some(ptr) = guard.view {
        let view = unsafe { ptr.as_ref() };
        unsafe {
          if let Some(window) = view.window() {
            let _ = window.makeFirstResponder(Some(view));
          }
        }
      }
    });
  }

  pub fn create_session(&self, session_id: &str, cols: u32, rows: u32) {
    let mut guard = self.inner.lock();
    guard
      .sessions
      .insert(session_id.to_string(), TermSession::new(cols, rows));
  }

  pub fn destroy_session(&self, session_id: &str) {
    let mut guard = self.inner.lock();
    guard.sessions.remove(session_id);
    if guard.active.as_deref() == Some(session_id) {
      guard.active = None;
    }
    self.request_redraw();
  }

  pub fn set_active_session(&self, session_id: Option<&str>) {
    let mut guard = self.inner.lock();
    guard.active = session_id.map(|s| s.to_string());
    drop(guard);
    self.request_redraw();
  }

  pub fn write_output(&self, session_id: &str, data: &[u8]) {
    let mut guard = self.inner.lock();
    let dirty = guard.active.as_deref() == Some(session_id);
    if let Some(session) = guard.sessions.get_mut(session_id) {
      session.parser.advance(&mut session.term, data);
    }
    drop(guard);
    if dirty {
      self.request_redraw();
    }
  }

  /// Jump viewport to live cursor (after user types while scrolled in history).
  pub fn scroll_to_bottom(&self, session_id: &str) {
    let mut guard = self.inner.lock();
    let Some(session) = guard.sessions.get_mut(session_id) else {
      return;
    };
    if session.term.grid().display_offset() == 0 {
      return;
    }
    session.term.scroll_display(Scroll::Bottom);
    let dirty = guard.active.as_deref() == Some(session_id);
    drop(guard);
    if dirty {
      self.request_redraw();
    }
  }

  pub fn resize_session(&self, session_id: &str, cols: u32, rows: u32) {
    let mut guard = self.inner.lock();
    if let Some(session) = guard.sessions.get_mut(session_id) {
      let size = TermSize {
        columns: cols as usize,
        screen_lines: rows as usize,
      };
      session.term.resize(size);
    }
    drop(guard);
    self.request_redraw();
  }

  fn request_redraw(&self) {
    let inner = Arc::clone(&self.inner);
    // Async is fine for display invalidation.
    DispatchQueue::main().exec_async(move || {
      let guard = inner.lock();
      if let Some(ptr) = guard.view {
        unsafe {
          ptr.as_ref().setNeedsDisplay(true);
        }
      }
    });
  }

  pub fn cell_metrics(&self) -> (f64, f64) {
    let guard = self.inner.lock();
    (guard.cell_width, guard.cell_height)
  }

  pub fn set_theme(&self, theme: ThemePalette) {
    let mut guard = self.inner.lock();
    guard.theme = theme;
    drop(guard);
    self.request_redraw();
  }

  pub fn clear_selection(&self) {
    let mut guard = self.inner.lock();
    guard.sel_anchor = None;
    guard.sel_end = None;
    guard.selecting = false;
    drop(guard);
    self.request_redraw();
  }

  pub fn selected_text(&self) -> Option<String> {
    let guard = self.inner.lock();
    let (a, b) = match (guard.sel_anchor, guard.sel_end) {
      (Some(a), Some(b)) => (a, b),
      _ => return None,
    };
    let session_id = guard.active.as_ref()?;
    let session = guard.sessions.get(session_id)?;
    Some(extract_text(&session.term, a, b))
  }

  pub fn clear_search(&self) {
    let mut guard = self.inner.lock();
    guard.search_match = None;
    drop(guard);
    self.request_redraw();
  }

  /// Find `query` in the active session grid. `forward` = next, else previous.
  pub fn find_in_active(&self, query: &str, forward: bool) -> bool {
    let q = query.to_lowercase();
    if q.is_empty() {
      self.clear_search();
      return false;
    }
    let mut guard = self.inner.lock();
    let Some(session_id) = guard.active.clone() else {
      return false;
    };
    let Some(session) = guard.sessions.get(&session_id) else {
      return false;
    };
    let cols = session.term.columns();
    let rows = session.term.screen_lines();
    let grid = session.term.grid();
    let display_offset = grid.display_offset();

    let mut lines: Vec<String> = Vec::with_capacity(rows);
    for row in 0..rows {
      let mut s = String::with_capacity(cols);
      for col in 0..cols {
        let point = viewport_to_point(display_offset, Point::new(row, Column(col)));
        s.push(grid[point].c);
      }
      lines.push(s);
    }

    let start_from = guard
      .search_match
      .map(|(_a, b)| {
        if forward {
          (b.row, b.col + 1)
        } else if b.col > 0 {
          (b.row, b.col - 1)
        } else if b.row > 0 {
          (b.row - 1, cols.saturating_sub(1))
        } else {
          (0, 0)
        }
      })
      .unwrap_or(if forward {
        (0, 0)
      } else {
        (rows.saturating_sub(1), cols.saturating_sub(1))
      });

    let found = if forward {
      find_forward(&lines, &q, start_from.0, start_from.1, cols)
        .or_else(|| find_forward(&lines, &q, 0, 0, cols))
    } else {
      find_backward(&lines, &q, start_from.0, start_from.1)
        .or_else(|| find_backward(&lines, &q, rows.saturating_sub(1), cols.saturating_sub(1)))
    };

    if let Some((start, end)) = found {
      guard.search_match = Some((start, end));
      guard.sel_anchor = Some(start);
      guard.sel_end = Some(end);
      drop(guard);
      self.request_redraw();
      true
    } else {
      guard.search_match = None;
      drop(guard);
      self.request_redraw();
      false
    }
  }
}

fn find_forward(
  lines: &[String],
  q: &str,
  start_row: usize,
  start_col: usize,
  _cols: usize,
) -> Option<(CellPos, CellPos)> {
  let qlen = q.chars().count();
  if qlen == 0 {
    return None;
  }
  for row in start_row..lines.len() {
    let line_lower = lines[row].to_lowercase();
    let from = if row == start_row { start_col } else { 0 };
    if let Some(rel) = line_lower.get(from..).and_then(|s| s.find(q)) {
      let col = from + rel;
      return Some((
        CellPos { col, row },
        CellPos {
          col: col + qlen - 1,
          row,
        },
      ));
    }
  }
  None
}

fn find_backward(lines: &[String], q: &str, start_row: usize, start_col: usize) -> Option<(CellPos, CellPos)> {
  let qlen = q.chars().count();
  if qlen == 0 || lines.is_empty() {
    return None;
  }
  let mut row = start_row.min(lines.len() - 1);
  loop {
    let line_lower = lines[row].to_lowercase();
    let end = if row == start_row {
      (start_col + 1).min(line_lower.len())
    } else {
      line_lower.len()
    };
    if let Some(slice) = line_lower.get(..end) {
      if let Some(col) = slice.rfind(q) {
        return Some((
          CellPos { col, row },
          CellPos {
            col: col + qlen - 1,
            row,
          },
        ));
      }
    }
    if row == 0 {
      break;
    }
    row -= 1;
  }
  None
}

fn extract_text(term: &Term<NullListener>, a: CellPos, b: CellPos) -> String {
  let cols = term.columns();
  let rows = term.screen_lines();
  let (start, end) = ordered_range(a.clamp(cols, rows), b.clamp(cols, rows));
  let grid = term.grid();
  let display_offset = grid.display_offset();
  let mut out = String::new();
  for row in start.row..=end.row {
    let c0 = if row == start.row { start.col } else { 0 };
    let c1 = if row == end.row {
      end.col
    } else {
      cols.saturating_sub(1)
    };
    for col in c0..=c1 {
      let point = viewport_to_point(display_offset, Point::new(row, Column(col)));
      out.push(grid[point].c);
    }
    if row != end.row {
      out.push('\n');
    }
  }
  out.trim_end_matches(' ').to_string()
}

fn ordered_range(a: CellPos, b: CellPos) -> (CellPos, CellPos) {
  if a.row < b.row || (a.row == b.row && a.col <= b.col) {
    (a, b)
  } else {
    (b, a)
  }
}

fn cell_in_range(cell: CellPos, a: CellPos, b: CellPos) -> bool {
  let (start, end) = ordered_range(a, b);
  if cell.row < start.row || cell.row > end.row {
    return false;
  }
  if start.row == end.row {
    return cell.col >= start.col && cell.col <= end.col;
  }
  if cell.row == start.row {
    return cell.col >= start.col;
  }
  if cell.row == end.row {
    return cell.col <= end.col;
  }
  true
}

define_class!(
  #[unsafe(super(NSView))]
  #[name = "OmclNativeTermView"]
  #[ivars = TermViewIvars]
  struct TermView;

  impl TermView {
    #[unsafe(method(drawRect:))]
    fn draw_rect(&self, _dirty: NSRect) {
      paint_term(self);
    }

    #[unsafe(method(isFlipped))]
    fn is_flipped(&self) -> bool {
      true
    }

    #[unsafe(method(acceptsFirstResponder))]
    fn accepts_first_responder(&self) -> bool {
      // Keyboard via Electron before-input-event; mouse stays on this view for selection.
      false
    }

    #[unsafe(method(mouseDown:))]
    fn mouse_down(&self, event: &NSEvent) {
      handle_mouse(self, event, MousePhase::Down);
    }

    #[unsafe(method(mouseDragged:))]
    fn mouse_dragged(&self, event: &NSEvent) {
      handle_mouse(self, event, MousePhase::Drag);
    }

    #[unsafe(method(mouseUp:))]
    fn mouse_up(&self, event: &NSEvent) {
      handle_mouse(self, event, MousePhase::Up);
    }

    #[unsafe(method(scrollWheel:))]
    fn scroll_wheel(&self, event: &NSEvent) {
      handle_scroll_wheel(self, event);
    }
  }
);

struct TermViewIvars {
  host: Mutex<Option<Arc<Mutex<HostInner>>>>,
}

impl TermView {
  fn new(mtm: MainThreadMarker, host: Arc<Mutex<HostInner>>) -> Retained<Self> {
    let this = mtm.alloc::<Self>().set_ivars(TermViewIvars {
      host: Mutex::new(Some(host)),
    });
    unsafe { msg_send![super(this), init] }
  }
}

const SCROLLBAR_W: f64 = 14.0;

fn paint_scrollbar(
  bounds: NSRect,
  history: usize,
  rows: usize,
  display_offset: usize,
  theme: &ThemePalette,
) {
  if history == 0 {
    return;
  }
  let track_x = (bounds.size.width - SCROLLBAR_W).max(0.0);
  let track_h = bounds.size.height.max(1.0);
  let total = (history + rows).max(1);
  // Keep thumb readable even with long scrollback.
  let thumb_h = ((rows as f64 / total as f64) * track_h).clamp(28.0, (track_h * 0.85).max(28.0));
  let travel = (track_h - thumb_h).max(0.0);
  let thumb_y = travel * (1.0 - display_offset as f64 / history as f64);

  unsafe {
    // Opaque gutter so it never disappears into the terminal background.
    let (br, bg, bb) = theme.background;
    let gutter = NSColor::colorWithCalibratedRed_green_blue_alpha(
      (br * 0.7 + 0.08).min(1.0),
      (bg * 0.7 + 0.09).min(1.0),
      (bb * 0.7 + 0.11).min(1.0),
      1.0,
    );
    gutter.setFill();
    if let Some(cls) = objc2::runtime::AnyClass::get(c"NSBezierPath") {
      let _: () = msg_send![
        cls,
        fillRect: NSRect::new(
          NSPoint::new(track_x, 0.0),
          NSSize::new(SCROLLBAR_W, track_h)
        )
      ];
    }

    // Thumb: theme cursor color (emerald) — high contrast on dark UI.
    let (cr, cg, cb) = theme.cursor;
    let thumb = NSColor::colorWithCalibratedRed_green_blue_alpha(cr, cg, cb, 1.0);
    thumb.setFill();
    let inset = 2.5_f64;
    if let Some(cls) = objc2::runtime::AnyClass::get(c"NSBezierPath") {
      let _: () = msg_send![
        cls,
        fillRect: NSRect::new(
          NSPoint::new(track_x + inset, thumb_y + 1.0),
          NSSize::new((SCROLLBAR_W - inset * 2.0).max(4.0), (thumb_h - 2.0).max(12.0))
        )
      ];
    }
  }
}

fn paint_term(view: &TermView) {
  let host = {
    let g = view.ivars().host.lock();
    g.clone()
  };
  let Some(host) = host else { return };
  let guard = host.lock();

  let bounds = view.bounds();
  let theme = guard.theme.clone();
  // Fill background via NSBezierPath (drawRect already has focus).
  unsafe {
    let (r, g, b) = theme.background;
    let bg = NSColor::colorWithCalibratedRed_green_blue_alpha(r, g, b, 1.0);
    bg.setFill();
    if let Some(cls) = objc2::runtime::AnyClass::get(c"NSBezierPath") {
      let _: () = msg_send![cls, fillRect: bounds];
    }
  }

  let Some(active_id) = guard.active.clone() else {
    return;
  };

  let Some(session) = guard.sessions.get(&active_id) else {
    return;
  };

  let cw = guard.cell_width.max(1.0);
  let ch = guard.cell_height.max(1.0);
  let cols = session.term.columns();
  let rows = session.term.screen_lines();
  let font = NSFont::monospacedSystemFontOfSize_weight(13.0, 0.0);
  let grid = session.term.grid();
  let display_offset = grid.display_offset();
  let history = grid.history_size();
  let show_cursor = session.term.mode().contains(TermMode::SHOW_CURSOR);
  let cursor_point = session.term.grid().cursor.point;

  for line in 0..rows {
    for col in 0..cols {
      let point = viewport_to_point(display_offset, Point::new(line, Column(col)));
      let cell = &grid[point];
      let ch_glyph = cell.c;
      let (fr, fg, fb) = ansi_color_rgb(cell.fg, false, &theme);
      let (br, bgc, bb) = ansi_color_rgb(cell.bg, true, &theme);
      let x = col as f64 * cw;
      let y = line as f64 * ch;
      let cell_rect = NSRect::new(NSPoint::new(x, y), NSSize::new(cw + 0.5, ch + 0.5));

      let pos = CellPos {
        col,
        row: line,
      };
      let selected = match (guard.sel_anchor, guard.sel_end) {
        (Some(a), Some(b)) => cell_in_range(pos, a, b),
        _ => false,
      };

      let (br, bgc, bb) = if selected {
        // Match xterm selectionBackground #10b98144 ≈ emerald wash
        (
          (br * 0.55 + 0.06).min(1.0),
          (bgc * 0.55 + 0.72).min(1.0),
          (bb * 0.55 + 0.50).min(1.0),
        )
      } else {
        (br, bgc, bb)
      };

      // Skip default-bg empty cells — already filled.
      let is_default_bg =
        (br - theme.background.0).abs() < 0.01
          && (bgc - theme.background.1).abs() < 0.01
          && (bb - theme.background.2).abs() < 0.01;
      if !is_default_bg || ch_glyph != ' ' {
        unsafe {
          let bg_color = NSColor::colorWithCalibratedRed_green_blue_alpha(br, bgc, bb, 1.0);
          bg_color.setFill();
          if let Some(cls) = objc2::runtime::AnyClass::get(c"NSBezierPath") {
            let _: () = msg_send![cls, fillRect: cell_rect];
          }
        }
      }

      if ch_glyph == ' ' {
        continue;
      }

      let s = NSString::from_str(&ch_glyph.to_string());
      unsafe {
        let dict_cls = objc2::runtime::AnyClass::get(c"NSMutableDictionary").unwrap();
        let attrs: *mut AnyObject = msg_send![dict_cls, dictionary];
        let _: () = msg_send![attrs, setObject: &*font forKey: ns_string!("NSFont")];
        let fg_color = NSColor::colorWithCalibratedRed_green_blue_alpha(fr, fg, fb, 1.0);
        let _: () = msg_send![attrs, setObject: &*fg_color forKey: ns_string!("NSColor")];
        let _: () = msg_send![&*s, drawAtPoint: NSPoint::new(x, y), withAttributes: attrs];
      }
    }
  }

  if show_cursor {
    if let Some(vp) = point_to_viewport(display_offset, cursor_point) {
      let x = vp.column.0 as f64 * cw;
      let y = vp.line as f64 * ch;
      let bar_h = (ch * 0.15_f64).max(2.0);
      let cursor_rect = NSRect::new(
        NSPoint::new(x, y + ch - bar_h),
        NSSize::new(cw.max(2.0), bar_h),
      );
      unsafe {
        let (r, g, b) = theme.cursor;
        let c = NSColor::colorWithCalibratedRed_green_blue_alpha(r, g, b, 0.95);
        c.setFill();
        if let Some(cls) = objc2::runtime::AnyClass::get(c"NSBezierPath") {
          let _: () = msg_send![cls, fillRect: cursor_rect];
        }
      }
    }
  }

  // Scrollbar — only when there is scrollback history.
  paint_scrollbar(bounds, history, rows, display_offset, &theme);
}

fn ansi_color_rgb(color: AnsiColor, is_bg: bool, theme: &ThemePalette) -> (f64, f64, f64) {
  match color {
    AnsiColor::Named(named) => named_rgb(named, is_bg, theme),
    AnsiColor::Spec(rgb) => (rgb.r as f64 / 255.0, rgb.g as f64 / 255.0, rgb.b as f64 / 255.0),
    AnsiColor::Indexed(idx) => indexed_rgb(idx, theme),
  }
}

fn named_rgb(named: NamedColor, is_bg: bool, theme: &ThemePalette) -> (f64, f64, f64) {
  match named {
    NamedColor::Black => theme.black,
    NamedColor::Red => theme.red,
    NamedColor::Green => theme.green,
    NamedColor::Yellow => theme.yellow,
    NamedColor::Blue => theme.blue,
    NamedColor::Magenta => theme.magenta,
    NamedColor::Cyan => theme.cyan,
    NamedColor::White => theme.white,
    NamedColor::BrightBlack => theme.black,
    NamedColor::BrightRed => theme.red,
    NamedColor::BrightGreen => theme.green,
    NamedColor::BrightYellow => theme.yellow,
    NamedColor::BrightBlue => theme.blue,
    NamedColor::BrightMagenta => theme.magenta,
    NamedColor::BrightCyan => theme.cyan,
    NamedColor::BrightWhite => theme.white,
    NamedColor::Foreground => theme.foreground,
    NamedColor::Background => theme.background,
    NamedColor::Cursor => theme.cursor,
    _ => {
      if is_bg {
        theme.background
      } else {
        theme.foreground
      }
    }
  }
}

fn indexed_rgb(idx: u8, theme: &ThemePalette) -> (f64, f64, f64) {
  match idx {
    0 => theme.black,
    1 => theme.red,
    2 => theme.green,
    3 => theme.yellow,
    4 => theme.blue,
    5 => theme.magenta,
    6 => theme.cyan,
    7 => theme.white,
    8 => theme.black,
    9 => theme.red,
    10 => theme.green,
    11 => theme.yellow,
    12 => theme.blue,
    13 => theme.magenta,
    14 => theme.cyan,
    15 => theme.white,
    16..=231 => {
      let n = idx - 16;
      let r = n / 36;
      let g = (n % 36) / 6;
      let b = n % 6;
      let c = |v: u8| {
        if v == 0 {
          0.0
        } else {
          (v as f64 * 40.0 + 55.0) / 255.0
        }
      };
      (c(r), c(g), c(b))
    }
    232..=255 => {
      let v = ((idx - 232) as f64 * 10.0 + 8.0) / 255.0;
      (v, v, v)
    }
  }
}

enum MousePhase {
  Down,
  Drag,
  Up,
}

fn set_display_offset_from_y(
  term: &mut Term<NullListener>,
  y: f64,
  view_h: f64,
) {
  let rows = term.screen_lines();
  let history = term.grid().history_size();
  if history == 0 {
    return;
  }
  let total = (history + rows).max(1);
  let thumb_h = ((rows as f64 / total as f64) * view_h).clamp(28.0, (view_h * 0.85).max(28.0));
  let travel = (view_h - thumb_h).max(1.0);
  let ratio = (1.0 - (y - thumb_h * 0.5).clamp(0.0, travel) / travel).clamp(0.0, 1.0);
  let target = (ratio * history as f64).round() as usize;
  let current = term.grid().display_offset();
  let delta = target as i32 - current as i32;
  if delta != 0 {
    term.scroll_display(Scroll::Delta(delta));
  }
}

fn handle_scroll_wheel(view: &TermView, event: &NSEvent) {
  let host = {
    let g = view.ivars().host.lock();
    g.clone()
  };
  let Some(host) = host else { return };

  let mut guard = host.lock();
  let Some(id) = guard.active.clone() else {
    return;
  };
  let ch = guard.cell_height.max(1.0);
  let Some(session) = guard.sessions.get_mut(&id) else {
    return;
  };
  if session.term.mode().contains(TermMode::ALT_SCREEN) {
    return;
  }

  let delta_y = event.scrollingDeltaY();
  let precise = event.hasPreciseScrollingDeltas();
  // macOS: positive deltaY = fingers up / scroll toward older history → increase offset
  let lines = if precise {
    (delta_y / ch).round() as i32
  } else if delta_y > 0.0 {
    3
  } else if delta_y < 0.0 {
    -3
  } else {
    0
  };
  if lines == 0 {
    return;
  }
  session.term.scroll_display(Scroll::Delta(lines));
  drop(guard);
  view.setNeedsDisplay(true);
}

fn handle_mouse(view: &TermView, event: &NSEvent, phase: MousePhase) {
  let host = {
    let g = view.ivars().host.lock();
    g.clone()
  };
  let Some(host) = host else { return };

  let local = unsafe {
    let win_pt = event.locationInWindow();
    view.convertPoint_fromView(win_pt, None)
  };
  let bounds = view.bounds();

  let mut guard = host.lock();
  let (cols, rows, history) = {
    let Some(id) = guard.active.clone() else {
      return;
    };
    let Some(session) = guard.sessions.get(&id) else {
      return;
    };
    (
      session.term.columns(),
      session.term.screen_lines(),
      session.term.grid().history_size(),
    )
  };

  let in_scrollbar = history > 0 && local.x >= bounds.size.width - SCROLLBAR_W;

  if in_scrollbar || guard.scrollbar_drag {
    match phase {
      MousePhase::Down => {
        guard.scrollbar_drag = true;
        if let Some(id) = guard.active.clone() {
          if let Some(session) = guard.sessions.get_mut(&id) {
            if !session.term.mode().contains(TermMode::ALT_SCREEN) {
              set_display_offset_from_y(&mut session.term, local.y, bounds.size.height);
            }
          }
        }
      }
      MousePhase::Drag => {
        if guard.scrollbar_drag {
          if let Some(id) = guard.active.clone() {
            if let Some(session) = guard.sessions.get_mut(&id) {
              if !session.term.mode().contains(TermMode::ALT_SCREEN) {
                set_display_offset_from_y(&mut session.term, local.y, bounds.size.height);
              }
            }
          }
        }
      }
      MousePhase::Up => {
        guard.scrollbar_drag = false;
      }
    }
    drop(guard);
    unsafe {
      view.setNeedsDisplay(true);
    }
    if matches!(phase, MousePhase::Up | MousePhase::Down) {
      crate::emit_focus_request();
    }
    return;
  }

  let cw = guard.cell_width.max(1.0);
  let ch = guard.cell_height.max(1.0);
  let cell = CellPos {
    col: (local.x / cw).floor().max(0.0) as usize,
    row: (local.y / ch).floor().max(0.0) as usize,
  }
  .clamp(cols, rows);

  match phase {
    MousePhase::Down => {
      guard.scrollbar_drag = false;
      guard.selecting = true;
      guard.sel_anchor = Some(cell);
      guard.sel_end = Some(cell);
      guard.search_match = None;
    }
    MousePhase::Drag => {
      if guard.selecting {
        guard.sel_end = Some(cell);
      }
    }
    MousePhase::Up => {
      if guard.selecting {
        guard.sel_end = Some(cell);
      }
      guard.selecting = false;
      // Click without drag → clear selection
      if guard.sel_anchor == guard.sel_end {
        guard.sel_anchor = None;
        guard.sel_end = None;
      }
    }
  }
  drop(guard);
  unsafe {
    view.setNeedsDisplay(true);
  }
  // After click/drag, return keyboard focus to Chromium (native view is above it).
  if matches!(phase, MousePhase::Up | MousePhase::Down) {
    crate::emit_focus_request();
  }
}

#[allow(dead_code)]
fn _keep_dispatch_types() {
  let _: Option<DispatchRetained<DispatchQueue>> = None;
  let _: Option<DispatchQueueAttr> = None;
}
