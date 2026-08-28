# Oh My CloudLink

**English** | [简体中文](README.md)

A Termius-like desktop app for SSH / SFTP / FTP connection management (formerly “云连 SSH”). Manage hosts, groups, SSH keys, terminals, file transfers, port forwards, and command snippets.

## Features

- **Host management** — Add, edit, and delete hosts; password and key authentication
- **Groups & tags** — Organize by environment/project; search by tags
- **SSH keys** — Centralized private-key management; discover keys from `~/.ssh`
- **SSH terminal** — Full xterm.js terminal; multi-tabs, multiple sessions per host, ⌘F search
- **SFTP / FTP file transfer** — Dual-pane file browser; upload / download / delete / rename
- **Port forwarding** — Local / remote / SOCKS5 dynamic tunnels, independent of terminal sessions
- **Command snippets** — Save common commands; quick insert in the terminal (per-host scope)
- **Connection logs** — Session output recording and read-only replay
- **Import / export & backup** — JSON backups; persistence via SQLite
- **i18n** — Chinese and English UI (optional system locale)

## Tech Stack

| Layer | Tech |
|------|------|
| Desktop | Electron |
| UI | React 19 + TypeScript + Tailwind CSS 4 |
| Terminal | xterm.js |
| SSH | ssh2 (Node.js) |
| SFTP | ssh2 SFTP subsystem |
| FTP | basic-ftp |
| Storage | Local SQLite (`~/Library/Application Support/oh-my-cloudlink/cloudlink.db`) |

## Quick Start

### Requirements

- Node.js >= 18
- npm >= 9

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Starts the Vite dev server and the Electron window together.

### Build

```bash
npm run build        # Compile renderer + Electron main process
npm run package      # Package distributable installers
```

## Project Structure

```
oh-my-cloudlink/
├── electron/           # Electron main process
│   ├── main.ts         # Window & IPC entry
│   ├── preload.ts      # Renderer API bridge
│   ├── ssh-manager.ts  # SSH connections
│   ├── sftp-manager.ts # SFTP transfers
│   ├── ftp-manager.ts  # FTP transfers
│   └── data-store.ts   # Local persistence
├── src/                # React renderer
│   ├── components/     # UI components
│   ├── hooks/          # Data hooks
│   ├── i18n/           # zh / en strings
│   └── types/          # Type definitions
└── public/
```

## Data Model

```typescript
type ConnectionProtocol = 'ssh' | 'sftp' | 'ftp'

interface Host {
  protocol: ConnectionProtocol  // SSH terminal / SFTP / FTP file transfer
  authType: 'password' | 'key'
  // ...
}
```

> Note: In the UI, hosts are mainly used for SSH/SFTP; pure FTP hosts go through the file-transfer panel. The `protocol` field distinguishes connection modes.

## Roadmap

- [x] SSH terminal
- [x] SFTP file browser (upload/download/delete/rename)
- [x] FTP file transfer
- [x] Host / group / key management
- [x] Data import & export
- [x] Port forwarding
- [x] Snippets / command snippets
- [x] Chinese / English i18n
- [ ] Encrypted data storage

## License

MIT
