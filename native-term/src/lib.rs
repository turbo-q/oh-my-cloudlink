#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::JsFunction;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::Arc;

#[cfg(target_os = "macos")]
mod macos;

type InputTsfn = ThreadsafeFunction<(String, String), ErrorStrategy::CalleeHandled>;
type FocusTsfn = ThreadsafeFunction<(), ErrorStrategy::CalleeHandled>;

struct HostState {
  #[cfg(target_os = "macos")]
  inner: Option<macos::NativeTermHost>,
  input_cb: Option<InputTsfn>,
  focus_cb: Option<FocusTsfn>,
}

static HOST: Lazy<Mutex<HostState>> = Lazy::new(|| {
  Mutex::new(HostState {
    #[cfg(target_os = "macos")]
    inner: None,
    input_cb: None,
    focus_cb: None,
  })
});

fn emit_input(session_id: String, data: String) {
  let guard = HOST.lock();
  if let Some(cb) = guard.input_cb.as_ref() {
    let _ = cb.call(Ok((session_id, data)), ThreadsafeFunctionCallMode::NonBlocking);
  }
}

pub(crate) fn emit_focus_request() {
  let guard = HOST.lock();
  if let Some(cb) = guard.focus_cb.as_ref() {
    let _ = cb.call(Ok(()), ThreadsafeFunctionCallMode::NonBlocking);
  }
}

#[napi]
pub fn is_available() -> bool {
  cfg!(target_os = "macos")
}

#[napi]
pub fn load_error() -> Option<String> {
  None
}

#[napi]
pub fn attach(window_handle: Buffer) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    let mut guard = HOST.lock();
    if guard.inner.is_some() {
      return Ok(());
    }
    let host = macos::NativeTermHost::attach(window_handle.as_ref(), Arc::new(emit_input))
      .map_err(|e| Error::from_reason(e))?;
    guard.inner = Some(host);
    Ok(())
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = window_handle;
    Err(Error::from_reason(
      "native-term is only available on macOS",
    ))
  }
}

#[napi]
pub fn detach() {
  #[cfg(target_os = "macos")]
  {
    let mut guard = HOST.lock();
    if let Some(host) = guard.inner.take() {
      host.destroy();
    }
  }
}

#[napi]
pub fn set_bounds(x: f64, y: f64, width: f64, height: f64, scale_factor: f64) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.set_bounds(x, y, width, height, scale_factor);
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (x, y, width, height, scale_factor);
  }
}

#[napi]
pub fn set_visible(visible: bool) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.set_visible(visible);
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = visible;
  }
}

#[napi]
pub fn focus() {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.focus();
    }
  }
}

#[napi]
pub fn create_session(session_id: String, cols: u32, rows: u32) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    let host = guard
      .inner
      .as_ref()
      .ok_or_else(|| Error::from_reason("native-term not attached"))?;
    host.create_session(&session_id, cols.max(1), rows.max(1));
    Ok(())
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (session_id, cols, rows);
    Err(Error::from_reason(
      "native-term is only available on macOS",
    ))
  }
}

#[napi]
pub fn destroy_session(session_id: String) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.destroy_session(&session_id);
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = session_id;
  }
}

#[napi]
pub fn set_active_session(session_id: Option<String>) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.set_active_session(session_id.as_deref());
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = session_id;
  }
}

#[napi]
pub fn write_output(session_id: String, data: String) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.write_output(&session_id, data.as_bytes());
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (session_id, data);
  }
}

#[napi]
pub fn scroll_to_bottom(session_id: String) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.scroll_to_bottom(&session_id);
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = session_id;
  }
}

#[napi]
pub fn resize_session(session_id: String, cols: u32, rows: u32) {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.resize_session(&session_id, cols.max(1), rows.max(1));
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (session_id, cols, rows);
  }
}

/// JS callback: `(sessionId: string, data: string) => void`
#[napi]
pub fn set_input_callback(callback: JsFunction) -> Result<()> {
  let tsfn: InputTsfn =
    callback.create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<(String, String)>| {
      let (session_id, data) = ctx.value;
      Ok(vec![
        ctx.env.create_string(&session_id)?.into_unknown(),
        ctx.env.create_string(&data)?.into_unknown(),
      ])
    })?;
  HOST.lock().input_cb = Some(tsfn);
  Ok(())
}

#[napi(object)]
pub struct CellMetrics {
  pub width: f64,
  pub height: f64,
}

#[napi]
pub fn get_cell_metrics() -> CellMetrics {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      let (width, height) = host.cell_metrics();
      return CellMetrics { width, height };
    }
  }
  CellMetrics {
    width: 8.0,
    height: 16.0,
  }
}

#[napi(object)]
pub struct NativeThemeColors {
  pub background: String,
  pub foreground: String,
  pub cursor: String,
  pub black: String,
  pub red: String,
  pub green: String,
  pub yellow: String,
  pub blue: String,
  pub magenta: String,
  pub cyan: String,
  pub white: String,
}

#[napi]
pub fn set_theme(theme: NativeThemeColors) {
  #[cfg(target_os = "macos")]
  {
    let palette = macos::ThemePalette {
      background: macos::parse_hex_rgb(&theme.background),
      foreground: macos::parse_hex_rgb(&theme.foreground),
      cursor: macos::parse_hex_rgb(&theme.cursor),
      black: macos::parse_hex_rgb(&theme.black),
      red: macos::parse_hex_rgb(&theme.red),
      green: macos::parse_hex_rgb(&theme.green),
      yellow: macos::parse_hex_rgb(&theme.yellow),
      blue: macos::parse_hex_rgb(&theme.blue),
      magenta: macos::parse_hex_rgb(&theme.magenta),
      cyan: macos::parse_hex_rgb(&theme.cyan),
      white: macos::parse_hex_rgb(&theme.white),
    };
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.set_theme(palette);
    }
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = theme;
  }
}

#[napi]
pub fn set_focus_callback(callback: JsFunction) -> Result<()> {
  let tsfn: FocusTsfn = callback.create_threadsafe_function(0, |ctx| {
    // No JS args — just invoke the callback.
    let _ = ctx;
    Ok(Vec::<napi::JsUnknown>::new())
  })?;
  HOST.lock().focus_cb = Some(tsfn);
  Ok(())
}

#[napi]
pub fn clear_focus_callback() {
  HOST.lock().focus_cb = None;
}

#[napi]
pub fn clear_input_callback() {
  HOST.lock().input_cb = None;
}

#[napi]
pub fn get_selected_text() -> Option<String> {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    return guard.inner.as_ref().and_then(|h| h.selected_text());
  }
  #[cfg(not(target_os = "macos"))]
  {
    None
  }
}

#[napi]
pub fn clear_selection() {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.clear_selection();
    }
  }
}

#[napi]
pub fn find_in_active(query: String, forward: bool) -> bool {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      return host.find_in_active(&query, forward);
    }
    false
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (query, forward);
    false
  }
}

#[napi]
pub fn clear_search() {
  #[cfg(target_os = "macos")]
  {
    let guard = HOST.lock();
    if let Some(host) = guard.inner.as_ref() {
      host.clear_search();
    }
  }
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
fn _keep_arc() {
  let _: Option<Arc<()>> = None;
}
