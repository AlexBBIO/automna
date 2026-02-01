# Sidebar Navigation Spec

**Inspired by:** Claude's sidebar (Chats, Projects, Artifacts, Code, Starred, Recents)

---

## Navigation Structure

```
┌─────────────────────────────────────┐
│  Automna                            │  ← Brand
├─────────────────────────────────────┤
│  💬 Chats                           │  ← Current channel list
│  📁 Files                           │  ← Agent workspace files
│  🧠 Memory                          │  ← Agent memory/notes
│  ⚙️ Settings                        │  ← User settings
├─────────────────────────────────────┤
│  ⭐ Starred                         │  ← Pinned channels
│     • Important Project             │
│     • Daily Notes                   │
├─────────────────────────────────────┤
│  🕐 Recents                         │  ← Recent channels
│     • General                       │
│     • Work Tasks                    │
│     • Research                      │
├─────────────────────────────────────┤
│  👤 Alex Corrino                    │  ← User profile
│  ✨ Pro Plan                        │  ← Subscription status
└─────────────────────────────────────┘
```

---

## Sections

### 1. Main Navigation

| Item | Icon | Description |
|------|------|-------------|
| **Chats** | 💬 | View/create chat channels (current functionality) |
| **Files** | 📁 | Browse agent's workspace, upload/download files |
| **Memory** | 🧠 | View agent's SOUL.md, USER.md, memory notes |
| **Settings** | ⚙️ | API keys, integrations, preferences |

### 2. Starred Channels
- User can star/pin important channels
- Always visible at top for quick access
- Drag to reorder

### 3. Recent Channels
- Last N channels used (sorted by recency)
- Auto-populated from usage
- Can be cleared

### 4. User Footer
- Profile picture + name (from Clerk)
- Subscription status (Free/Starter/Pro/Business)
- Click to access billing portal

---

## View States

### Chats View (Current)
- Shows chat interface with selected channel
- Channel list in sidebar

### Files View
```
┌─────────────────────────────────────────────────┐
│ 📁 Files                              [Upload ↑]│
├─────────────────────────────────────────────────┤
│ 📂 clawd/                                       │
│   ├─ 📄 SOUL.md                                │
│   ├─ 📄 USER.md                                │
│   ├─ 📄 MEMORY.md                              │
│   ├─ 📂 memory/                                │
│   │   └─ 📄 2026-02-01.md                      │
│   └─ 📂 skills/                                │
│       └─ 📄 ...                                │
├─────────────────────────────────────────────────┤
│ [Selected file content / Markdown preview]      │
└─────────────────────────────────────────────────┘
```

### Memory View
```
┌─────────────────────────────────────────────────┐
│ 🧠 Memory                                       │
├─────────────────────────────────────────────────┤
│ [Tabs: Soul | User | Notes | Tools]             │
├─────────────────────────────────────────────────┤
│ SOUL.md                                         │
│ ─────────                                       │
│ You're not a chatbot. You're becoming someone.  │
│                                                 │
│ ## Core Truths                                  │
│ - Be genuinely helpful...                       │
│                                          [Edit] │
└─────────────────────────────────────────────────┘
```

### Settings View
```
┌─────────────────────────────────────────────────┐
│ ⚙️ Settings                                     │
├─────────────────────────────────────────────────┤
│ API Keys                                        │
│   Anthropic: ••••••••••sk-123  [Change]         │
│   OpenAI:    Not configured    [Add]            │
│                                                 │
│ Integrations                                    │
│   Discord:   Not connected     [Connect]        │
│   Telegram:  Not connected     [Connect]        │
│   Email:     Not configured    [Setup]          │
│                                                 │
│ Preferences                                     │
│   Theme:     Dark ▼                             │
│   Language:  English ▼                          │
│                                                 │
│ Danger Zone                                     │
│   [Delete All Data]  [Reset Agent]              │
└─────────────────────────────────────────────────┘
```

---

## UI/UX Improvements for Chat

### Current Issues
1. Messages could be more visually distinct
2. Timestamps not visible by default
3. No message actions (copy, edit, regenerate)
4. Input area is basic
5. No file attachments
6. No message search

### Delightful Improvements

#### Messages
- [ ] Subtle hover glow on messages
- [ ] Smooth fade-in animation on new messages
- [ ] Better visual distinction between user/assistant
- [ ] Avatar for assistant (Automna logo or custom)
- [ ] Timestamps visible (but subtle)
- [ ] Message actions on hover: Copy, Edit, Regenerate, Delete

#### Input
- [ ] Larger, more prominent input area
- [ ] Attachment button with drag-drop support
- [ ] Voice input button (future)
- [ ] Slash commands (future): /clear, /export, /settings
- [ ] Auto-suggestions/completions (future)

#### Code Blocks
- [ ] Language icon in header
- [ ] Line numbers option
- [ ] Wrap/nowrap toggle
- [ ] Expand/collapse for long blocks
- [ ] "Run" button for certain languages (future)

#### Loading States
- [ ] Streaming text animation (typewriter effect)
- [ ] Subtle thinking indicator with elapsed time
- [ ] Progress for long operations

#### Empty States
- [ ] Friendly welcome message
- [ ] Suggested prompts/actions
- [ ] Quick tour for new users

#### Micro-interactions
- [ ] Subtle bounce on send
- [ ] Smooth scroll to new messages
- [ ] Haptic feedback on mobile (if supported)
- [ ] Sound effects (optional, off by default)

---

## Implementation Priority

### Phase 1: Navigation Foundation
1. Refactor sidebar to support multiple views (not just channels)
2. Add view state management (chats/files/memory/settings)
3. Add section headers (Main, Starred, Recents)

### Phase 2: Files View
1. File tree API in moltworker
2. File tree UI component
3. Markdown viewer/editor

### Phase 3: Memory View
1. Tabs for different memory files
2. Read/edit functionality
3. Syntax highlighting for markdown

### Phase 4: Settings View
1. API key management
2. Integration setup flows
3. Preferences

### Phase 5: Chat Polish
1. Message animations
2. Better actions
3. Improved input
4. Attachments

---

## Technical Notes

### State Management
```typescript
type SidebarView = 'chats' | 'files' | 'memory' | 'settings';

interface SidebarState {
  view: SidebarView;
  channels: Channel[];
  starredChannels: string[];  // channel keys
  recentChannels: string[];   // channel keys, sorted by recency
  currentChannel: string;
}
```

### localStorage Keys
- `automna-channels`: Channel list
- `automna-starred`: Starred channel keys
- `automna-recents`: Recent channel keys (auto-updated)
- `automna-sidebar-view`: Last active view

### API Endpoints Needed
- `GET /api/files?path=` - List directory
- `GET /api/files/read?path=` - Read file content
- `POST /api/files/write` - Write file content
- `POST /api/files/upload` - Upload file
- `GET /api/files/download?path=` - Download file

---

*Created: 2026-02-01*
