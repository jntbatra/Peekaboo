# Peekaboo — Build Plan

### Tauri v2 · React · TypeScript · Ollama-first

> **Philosophy:** `shortcut → peek → answer → disappear`
> Every architectural decision is measured against two questions: does this make it faster, and does it make it more beautiful?

---

## Stack Reference

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | **Tauri v2** | ~600KB binary, native OS APIs, no Chromium bundle |
| Frontend | **React 18 + TypeScript** | Concurrent mode for streaming; strict types catch bugs early |
| Styling | **TailwindCSS + shadcn/ui** | Utility-first speed; shadcn gives unstyled primitives, not opinionated components |
| Animation | **Motion (Framer)** | `layoutId`, spring physics, `AnimatePresence` — all needed for peekaboo transitions |
| State | **Zustand** | Minimal boilerplate; slices map cleanly to overlay, history, settings, providers |
| Persistence | **SQLite via `tauri-plugin-sql**` | Embedded, zero-config, fast for chat history and settings |
| Models | **Ollama (exclusive for v1)** | Local-first; no API key required; streaming via `/api/chat` |
| Provider layer | **Custom abstraction** | Thin interface today; swap in OpenAI/Anthropic/OpenRouter in future versions without rewrites |

---

## Repository Layout

```
peekaboo-app/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # App bootstrap, single-instance guard
│   │   ├── window.rs            # Peek window management, show/hide/position
│   │   ├── shortcuts.rs         # Global hotkey registration
│   │   ├── screenshot.rs        # Screen capture (xcap crate)
│   │   ├── notifications.rs     # Desktop notification bridge
│   │   ├── clipboard.rs         # Clipboard read/write
│   │   ├── selection.rs         # Frontmost-app selected text (Accessibility API)
│   │   └── commands.rs          # Tauri command exports to frontend
│   └── Cargo.toml
├── src/
│   ├── components/
│   │   ├── PeekSurface.tsx      # Root Peekaboo overlay surface
│   │   ├── Input.tsx            # Query input with attachment chips
│   │   ├── Response.tsx         # Streaming markdown renderer
│   │   ├── Attachments.tsx      # Screenshot / clipboard / file chips
│   │   ├── History.tsx          # Recents panel (slide-in)
│   │   └── Settings.tsx         # Model config, shortcuts, preferences
│   ├── providers/
│   │   ├── types.ts             # Provider interface definition
│   │   └── ollama.ts            # Ollama implementation
│   ├── store/
│   │   ├── peek.ts              # Visibility, input, current response
│   │   ├── history.ts           # Chat sessions, recents
│   │   └── settings.ts          # Model config, hotkey, preferences
│   ├── hooks/
│   │   ├── useStream.ts         # SSE/fetch streaming hook
│   │   ├── useShortcuts.ts      # In-overlay keyboard bindings
│   │   └── useAttachments.ts    # Attachment state and drag-drop
│   ├── db/
│   │   └── migrations/          # SQL migration files
│   ├── lib/
│   │   └── markdown.ts          # Markdown → React renderer config
│   └── main.tsx
└── package.json

```

---

## Phase 0 — Tauri Shell & Window Mechanics (Days 1–4)

Prove the performance baseline before any UI exists.

### Tauri Window Config (`tauri.conf.json`)

```json
{
  "windows": [{
    "label": "peekaboo",
    "title": "",
    "width": 660,
    "height": 80,
    "resizable": false,
    "decorations": false,
    "transparent": true,
    "alwaysOnTop": true,
    "skipTaskbar": true,
    "visible": false,
    "center": false,
    "focus": false
  }]
}

```

Key flags: `decorations: false` removes OS chrome. `transparent: true` lets the React layer own the border-radius and shadow. `visible: false` starts hidden. `skipTaskbar: true` keeps it out of the dock/taskbar.

### Rust: Window Show/Hide (`window.rs`)

```rust
// Pre-position on the correct monitor before showing
// Never reposition after visible — causes flash
#[tauri::command]
pub fn show_peek(app: AppHandle) {
    let window = app.get_webview_window("peekaboo").unwrap();
    let monitor = window.current_monitor().unwrap().unwrap();
    let size = monitor.size();
    let scale = monitor.scale_factor();

    // Spotlight position: centered horizontally, 32% from top
    let x = (size.width as f64 / scale / 2.0) - 330.0;
    let y = size.height as f64 / scale * 0.32;

    window.set_position(PhysicalPosition::new(x, y)).unwrap();
    window.show().unwrap();
    window.set_focus().unwrap();
}

#[tauri::command]
pub fn hide_peek(app: AppHandle) {
    let window = app.get_webview_window("peekaboo").unwrap();
    window.hide().unwrap();
}

```

### Rust: Global Shortcut (`shortcuts.rs`)

Use `tauri-plugin-global-shortcut`. Default: `CmdOrCtrl+Space` (user-configurable).

```rust
app.global_shortcut().on_shortcut("CmdOrCtrl+Space", |app, _shortcut, _event| {
    let window = app.get_webview_window("peekaboo").unwrap();
    if window.is_visible().unwrap() {
        let _ = window.hide();
    } else {
        show_peek(app.clone());
    }
})?;

```

**Single-instance guard:** Use `tauri-plugin-single-instance`. A second launch invocation should trigger Peekaboo to unhide, not open a new window.

### Performance: Pre-warm the Renderer

The renderer process starts at app launch and stays alive. The window is hidden, not destroyed and recreated. This is the single most important performance decision — `window.show()` on an already-loaded webview yields exceptional responsiveness. Creating a new window introduces unacceptable launch friction.

**Tasks**

* [ ] Initialize Tauri project, configure window as above
* [ ] Implement `show_peek` / `hide_peek` commands
* [ ] Register global shortcut
* [ ] Implement focus-loss listener: clicking outside hides Peekaboo
* [ ] Add `performance.now()` instrumentation — log hotkey→visible delta to console
* [ ] Verify execution latencies on cold launch (after first boot, not first ever invocation)
* [ ] Add system tray icon with "Show" / "Quit" — the only non-peek surface

**Target:** Blank interface, styled shell, smooth and immediate transition. Nothing else ships from this phase.

---

## Phase 1 — Core Ask Loop (Days 4–9)

The product's heartbeat. Polish this before adding any features.

### Provider Interface (`providers/types.ts`)

```typescript
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string }; // base64 data URI
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface Provider {
  id: string;
  name: string;
  models: () => Promise<string[]>;
  stream: (messages: Message[], model: string) => AsyncIterable<StreamChunk>;
  abort: () => void;
}

```

### Ollama Implementation (`providers/ollama.ts`)

```typescript
export class OllamaProvider implements Provider {
  id = 'ollama';
  name = 'Ollama';
  private controller: AbortController | null = null;

  async *stream(messages: Message[], model: string): AsyncIterable<StreamChunk> {
    this.controller = new AbortController();

    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: this.controller.signal,
      body: JSON.stringify({ model, messages, stream: true }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        const json = JSON.parse(line);
        yield { delta: json.message?.content ?? '', done: json.done ?? false };
      }
    }
  }

  abort() { this.controller?.abort(); }

  async models(): Promise<string[]> {
    const res = await fetch('http://localhost:11434/api/tags');
    const data = await res.json();
    return data.models.map((m: any) => m.name);
  }
}

```

### Streaming Hook (`hooks/useStream.ts`)

```typescript
export function useStream() {
  const [content, setContent] = useState('');
  const [streaming, setStreaming] = useState(false);

  const run = useCallback(async (
    provider: Provider,
    messages: Message[],
    model: string,
    onComplete?: (full: string) => void
  ) => {
    setContent('');
    setStreaming(true);
    let full = '';

    for await (const chunk of provider.stream(messages, model)) {
      full += chunk.delta;
      // Batch DOM updates to animation frames — never update per-token
      setContent(full);
    }

    setStreaming(false);
    onComplete?.(full);
  }, []);

  return { content, streaming, run };
}

```

### Peekaboo Store (`store/peek.ts`)

```typescript
interface PeekState {
  visible: boolean;
  input: string;
  messages: Message[];
  activeSessionId: string | null;
  backgroundTasks: BackgroundTask[];

  setInput: (v: string) => void;
  addMessage: (m: Message) => void;
  clear: () => void;
  setVisible: (v: boolean) => void;
  addBackgroundTask: (t: BackgroundTask) => void;
}

```

### Keyboard Bindings (in-app)

| Key | Action |
| --- | --- |
| `Enter` | Submit query |
| `Shift+Enter` | Newline in input |
| `Escape` | Dismiss to background (if streaming) |
| `↑` (empty input) | Load previous question |
| `Cmd+K` | Clear current conversation |
| `Cmd+H` | Toggle history panel |
| `Cmd+,` | Open settings |
| `Cmd+/` | Show shortcut cheat sheet |
| `Cmd+Shift+Space` | Trigger screenshot capture |

**Tasks**

* [ ] Build `<Input/>` component — textarea auto-expands, max 4 lines, then scrolls
* [ ] Build `<Response/>` — markdown via `react-markdown` + `remark-gfm`
* [ ] Implement `useStream` hook
* [ ] Wire Ollama provider exclusively, handle connection errors gracefully
* [ ] Implement `useShortcuts` hook with all bindings above
* [ ] `Cmd+K` clears state and resets input focus
* [ ] Auto-focus input on launch (via `autoFocus` or `ref.focus()` in `useEffect`)

---

## Phase 2 — Design Direction & Foundations (Days 8–13)

Build once, inherit everywhere. Leave flexibility for iterative refinement based on usage patterns.

### Design Paradigm & Visual References

Rather than enforcing rigid, absolute design tokens early in development, Peekaboo’s interface leans on the aesthetic foundations of industry-standard productivity tools. Layout structures, contrast ratios, micro-interactions, and lighting should directly channel:

* **Raycast / Linear:** Hyper-crisp typography, distinct keycap behaviors, minimal but intentional borders, and highly functional information grouping.
* **Arc / Perplexity Desktop:** Organic, tactile animations, immersive dark surfaces, clean gradients, and subtle, floating container depths.

### Global Geometry & Structural Layering

* **Layout Controls:** Utilize TailwindCSS utilities matched alongside dynamic spring properties from Motion (`Framer`). Ensure layout transitions feel physically tethered to input size expansions.
* **Depth Construction:** Layering is achieved via an explicit multi-tier drop-shadow structure (ambient occlusion shadow coupled with a distinct directional close-proximity shadow) alongside a faint white inner reflection ring to create a clear glass-like separation over background windows.
* **Typography Hierarchy:** Powered by native integration of `Inter` for general layout/input fields and `JetBrains Mono` for block environments.

### Motion Profiles

```typescript
// Motion configurations for fluid structural morphing
export const peekVariants = {
  hidden:  { opacity: 0, scale: 0.97, y: -4 },
  visible: { opacity: 1, scale: 1,    y: 0,
             transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] } },
  exit:    { opacity: 0, scale: 0.98, y: -2,
             transition: { duration: 0.08, ease: 'easeIn' } },
};

export const responseVariants = {
  hidden:  { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0,
             transition: { duration: 0.15, delay: 0.05 } },
};

export const chipVariants = {
  hidden:  { opacity: 0, scale: 0.85, x: -4 },
  visible: { opacity: 1, scale: 1,    x: 0,
             transition: { type: 'spring', stiffness: 400, damping: 28 } },
  exit:    { opacity: 0, scale: 0.85, x: 4,
             transition: { duration: 0.1 } },
};

```

**Tasks**

* [ ] Initialize tailwind config matching the visual balance of the referenced desktop tools
* [ ] Implement `@fontsource/inter` and `@fontsource/jetbrains-mono`
* [ ] Build standard UI primitives (Input areas, Attachment chips, Model indicators, Markdown containers)
* [ ] Configure `AnimatePresence` for seamless interface injection and removal
* [ ] Ensure full support for `prefers-reduced-motion` configurations

---

## Phase 3 — Context Acquisition & Workflows (Days 12–18)

### Quick Explain Workflow (Instant Inline Capture)

This feature dramatically compresses the path between selecting text on screen and receiving assistance.

1. **Highlight text** inside any active host application window (browser, terminal, editor).
2. **Press designated shortcut** (user-defined global binding).
3. **Peekaboo instantly mounts** with that highlighted text extracted, pre-processed, and attached as a visual context chip in the query field.
4. **Immediate Interaction:** The user can instantly type their follow-up prompt or hit `Enter` to initiate an automatic explanation summary.

### Screenshot Capture (Rust: `screenshot.rs`)

Use the `xcap` crate — cross-platform, no external deps.

```rust
use xcap::Monitor;

#[tauri::command]
pub async fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<String, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors.into_iter()
        .find(|m| m.x() <= x && m.y() <= y)
        .ok_or("Monitor not found")?;

    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    let cropped = crop_image(image, x, y, width, height);
    Ok(encode_base64_png(cropped))
}

```

**Capture UX flow:**

1. `Cmd+Shift+Space` → hide interface → show a full-screen transparent capture window
2. User drags to select region (crosshair cursor, live selection rect)
3. On mouse-up: capture region → show Peekaboo again → attach image chip
4. Peekaboo reappears with the screenshot already attached — user just types the question

### Selected Text (Rust: `selection.rs`)

macOS: Accessibility API via `ax` crate or AppleScript fallback:

```rust
let script = r#"tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
    tell process frontApp
        set selectedText to value of (first text field whose selected text is not "")
    end tell
end tell"#;

```

Windows: `UIAutomation` via `windows` crate, `ITextProvider::GetSelection`.

Auto-attach selected text when Peekaboo opens if non-empty (can be dismissed by user).

### Clipboard Detection (Rust: `clipboard.rs`)

```rust
#[tauri::command]
pub fn read_clipboard() -> Result<ClipboardContent, String> {
    // Returns { type: "text" | "image", content: String }
}

```

Clipboard content is not auto-attached — user pastes with `Cmd+V` into the input. If clipboard contains an image, paste creates an image chip instead of inserting text.

### Attachment State (`hooks/useAttachments.ts`)

```typescript
interface Attachment {
  id: string;
  type: 'screenshot' | 'clipboard' | 'selection' | 'file';
  label: string;           // display name in chip
  content: string;         // base64 for images, text for text
  mediaType: string;       // 'image/png', 'text/plain', etc.
}

```

**Tasks**

* [ ] Implement `capture_region` Tauri command with xcap
* [ ] Build full-screen capture window with responsive drag selection bounding box
* [ ] Wire Quick Explain global hotkey orchestration and text parsing fallback pipeline
* [ ] Implement standard clipboard interception handlers for smart `Cmd+V` image routing
* [ ] Build attachment chip UI utilizing reactive layout springs

---

## Phase 4 — Background Completion & Notifications (Days 17–20)

### Background Task Model

```typescript
interface BackgroundTask {
  id: string;
  question: string;         // first 100 chars, for notification
  startedAt: number;
  status: 'running' | 'complete' | 'error';
  result?: string;
  sessionId: string;
}

```

**Behavior:**

* User presses `Escape` while streaming → interface hides immediately, streaming context remains actively bound inside `useStream`
* Task stored in `peek.backgroundTasks` in Zustand
* On completion: Tauri command `show_notification(title, body)` fires
* Notification tap → unhide Peekaboo + navigate directly to that ongoing active session
* In-app indicator: a subtle pulsing element in the visual periphery when long background generation routines are active

### Rust: Notifications (`notifications.rs`)

```rust
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String, session_id: String) {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .action("open", "Open")
        .show()
        .unwrap();
}

```

**Tasks**

* [ ] Decouple execution runtime instances from reactive frontend view unmounting
* [ ] Map active session tracking hooks inside the Zustand global engine state
* [ ] Connect Tauri OS-native background notifications plugin bridges
* [ ] Build fluid background processing indicator components into the main panel edge

---

## Phase 5 — Local History Architecture (Days 19–23)

### Explicit Product Rules: History is Secondary

To preserve the ephemeral nature of the workflow, Peekaboo explicitly demotes historical logs.

* **The UI must never mutate into a traditional multi-column chatbot layout, sidebar app, or complex playground workspace.**
* History acts purely as an invisible safety valve for quick review, hidden out of view until explicitly summoned via hotkey actions.

### Data Schema

For Phase 1, data persistence is maintained locally via cleartext SQLite. Advanced security schemes like rest-layer encryption are deferred to future lifecycle scopes.

```sql
-- migrations/001_initial.sql

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  title       TEXT,            -- auto-generated from first user message
  model       TEXT NOT NULL,
  provider_id TEXT NOT NULL
);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,   -- stored cleartext in v1
  created_at  INTEGER NOT NULL,
  has_attachment INTEGER DEFAULT 0
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

```

### History Panel UI

Triggered by `Cmd+H`. Slides in seamlessly from the left edge as a transient utility layer within the same window boundaries — avoiding structural fragmentation or window expansion.

**Tasks**

* [ ] Establish `tauri-plugin-sql` initial wiring and configure automated schema migration runner
* [ ] Write straightforward CRUD abstraction functions for sessions and underlying message payloads
* [ ] Design the slide-out `<History/>` interaction layout matching structural references
* [ ] Wire Up-Arrow keyboard shortcut to instantly load the user's last generated prompt string
* [ ] Integrate an optional periodic retention sweep worker (e.g., auto-cleaning elements past 90 days)

---

## Phase 6 — Settings & Model Configuration (Days 22–26)

Settings live outside the transient window experience — accessible via tray options or `Cmd+,`.

### Settings Window

A secondary, compact, dedicated static utility window (~480×520). Inherits identical visual primitives but utilizes standard OS window containment.

### Settings Configuration Interface

```typescript
interface Settings {
  hotkey: string;           // default: 'CmdOrCtrl+Space'
  activeProvider: string;   // fixed to 'ollama' in v1
  activeModel: string;      // fallback auto-discovered model target
  historyRetentionDays: number; // default: 90
  launchAtLogin: boolean;
  providers: ProviderConfig[];
}

interface ProviderConfig {
  id: string;               // 'ollama'
  enabled: boolean;
  baseUrl?: string;         // 'http://localhost:11434'
  defaultModel: string;
}

```

### Inline Model Quick Switch

Typing `/model` into the input field opens a command-palette overlay containing all models found running on the local system. Arrow keys handle selection, Enter updates configuration state, and Escape cancels out.

**Tasks**

* [ ] Scaffold isolated window setup properties within Tauri compilation files
* [ ] Implement automated local network discovery routines to identify operational Ollama model instances
* [ ] Build modular inputs to safely modify key global hotkeys
* [ ] Wire the `/model` input execution command hook inside the frontend input controller

---

## Phase 7 — Performance Targets & Optimization (Days 25–30)

### Latency Budget & Real-World Responsiveness

Benchmark telemetry metrics serve as performance indicators, but perceived speed, transition fluidness, and interactive snappiness take precedence over dogmatic millisecond counters.

| Target Area | Target Threshold | Measurement Context |
| --- | --- | --- |
| Keypress Registration → Window Display | **100–150ms (Excellent)** | Hardware Execution Profile |
| Keypress Registration → Window Display | **150–250ms (Good)** | Baseline Standard Target |
| Keypress Registration → Window Display | **>250ms (Investigate)** | Optimization Required |
| Application Dismissal Transition | <40ms | Visual Frame Rate Inspection |
| Context Capture Extraction Loop | <350ms | React Performance Metric |
| Initial Stream Processing Frame | <500ms | Local Model Warmup Latency |

### Optimization Procedures

* **Lazy Loading Bundles:** Segment hefty rendering blocks (such as syntax highlighter extensions) via code splitting approaches to prevent asset bloating on core runtime thread launches.
* **Avoid Tauri Command Overheads:** Keep high-frequency streaming events contained exclusively within client memory bounds (Web Fetch pipelines connected to Ollama endpoints). Do not tunnel token-by-token processing layers across native Tauri IPC wrappers.

**Tasks**

* [ ] Implement baseline `performance.mark` tracing parameters at critical launch entry points
* [ ] Audit frontend package allocation weights, trimming redundant third-party modules
* [ ] Ensure rendering loops drop unnecessary state invalidations during chunk processing
* [ ] Validate frame stability on base targets (such as machines with integrated graphics architectures)

---

## Phase 8 — Accessibility & Keyboard Completeness (Days 28–32)

* [ ] Complete semantic focus traversal support over every runtime UI component instance
* [ ] Mount proper `role="dialog"` and contextual `aria-*` tags over root structural viewspaces
* [ ] Enforce isolated keyboard focus lock scopes when elements are displayed on screen
* [ ] Wire global `Cmd+/` legend view summarizing current operational hotkeys
* [ ] Verify accessibility compliance handling on underlying targeted operating systems

---

## Phase 9 — Compilation & Distribution (Days 32–36)

### Operating System Deployments

* **macOS:** Signed through Developer ID cert paths, verified via notarization tools, distributed via lightweight `.dmg` containers or automated homebrew cask taps.
* **Windows:** Packaged through optimized installers via default native compilation tooling.
* **Auto-Update Subsystem:** Configured natively through integrated client updater wrappers tracking project updates.

### Build Configuration Parameters

```toml
# Cargo.toml — Optimized Release Engineering Configuration
[profile.release]
opt-level     = 3
lto           = true
codegen-units = 1
strip         = true

```

---

## Scope Matrix & Product Guardrails

### Definitively Out of Scope for v1

* Cloud LLM Providers (OpenAI, Anthropic, OpenRouter) — Abstraction layer is preserved, but no connection code or configuration UI will be shipped in v1.
* Voice/Audio transcription streaming pipelines.
* Automated OCR text processing layers over graphical screenshots.
* Complex agent loops, chain-of-thought routing frameworks, or localized vector search embedding generation (RAG).

### Non-Negotiable Hard Rules

1. **Zero-Telemetry Default:** No analytical payloads, usage counters, or external tracking mechanisms can be embedded. Peekaboo respects user privacy unconditionally.
2. **True Offline Independence:** The application must remain perfectly operational in fully air-gapped environments assuming an active local Ollama instance is present.
3. **No Window Multiplication:** The frontend interface must operate under a unified, single-pane philosophy. No nested sheets, floating child overlays, or stacked panels.