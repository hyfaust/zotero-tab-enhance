# Tab Enhance for Zotero

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)
![Downloads latest release](https://img.shields.io/github/downloads/hyfaust/zotero-tab-enhance/latest/total?color=yellow)

A powerful Zotero 7 add-on that enhances tab management with vertical sidebar, grouping, batch operations, and more.

## Features

### Enhanced Horizontal Tab Context Menu
- **Show in File Manager**: Quickly locate the current document in the file system
- **Reload Tab**: Refresh the tab to reflect external editor changes
- **Copy Reference**: Copy citation to clipboard using your Zotero export settings

### Vertical Tab Sidebar
- **Vertical Tab View**: Display all open tabs in a collapsible sidebar for easy switching
- **Tab Grouping**: Organize tabs into color-coded groups with expandable/collapsible sections
- **Tab Search**: Quickly filter and find tabs by title, metadata, or group name
- **Multi-Select Mode**: 
  - `Ctrl/Cmd + Click`: Toggle individual tab selection
  - `Shift + Click`: Select a range of tabs within the same group
  - `Ctrl/Cmd + Click Group Header`: Select all members in a group
  - `ESC`: Exit multi-select mode
  - `Delete/Backspace`: Remove selected members from groups
- **Batch Operations**: Add/remove multiple tabs to/from groups simultaneously

### One-Tap Tab Collection
- **Collect All Tabs**: Click the 📋 button to gather all open tabs into a timestamped group and close them
- **Quick Organization**: Perfect for saving your workspace with one click

### Library Integration
- **Right-Click in Library**: Add selected items to tab groups directly from the library pane
- **Batch Item Addition**: Add multiple library items to groups at once

### Customization
- **Collapsible Sidebar**: Toggle visibility with `Ctrl+B` shortcut
- **Adjustable Width**: Drag the splitter to resize the sidebar
- **Color-Coded Groups**: Six distinct colors for visual organization
- **View Modes**: Switch between Default, Recent, and Type views

## Installation

1. Download the latest `.xpi` file from the [Releases page](https://github.com/hyfaust/zotero-tab-enhance/releases)
2. In Zotero, go to `Tools -> Add-ons -> ⚙️ -> Install Add-on From File`
3. Select the downloaded `.xpi` file and confirm installation
4. Restart Zotero if prompted

## Compatibility

- Requires **Zotero 7.0** or higher
- Compatible with Zotero 7.0-7.1.*
- All features are disabled by default to avoid conflicts. Enable them in preferences.

## Usage Guide

### Getting Started

1. Open Zotero preferences (`Edit -> Settings`)
2. Navigate to the Tab Enhance section
3. Enable "Vertical Tabs" and/or "Horizontal Tab Enhancement"
4. The sidebar will appear on the left side of your Zotero window

### Tab Grouping

1. **Create a Group from a Tab**:
   - Open one or more tabs
   - Multi-select tabs using `Ctrl/Cmd + Click`
   - Click the `+` button in the sidebar header
   - Enter a group name

2. **Add Tabs to Existing Groups**:
   - Right-click any tab in the sidebar
   - Select "Add to Group" and choose a target group
   - Or use batch selection and right-click to add multiple tabs

3. **Manage Groups**:
   - Right-click group headers to rename, change color, expand/collapse, or dissolve
   - Drag group headers to reorder them
   - Click group headers to toggle expanded/collapsed state

### Multi-Select Operations

1. **Enable Multi-Select**:
   - Hold `Ctrl` (Windows/Linux) or `Cmd` (Mac) and click tabs to select them
   - Hold `Shift` and click to select a range of tabs

2. **Batch Actions**:
   - Right-click any selected tab
   - Choose from: Add to Group, Remove from Group, Close Selected, Clear Selection

3. **Select All in Group**:
   - Hold `Ctrl/Cmd` and click a group header to select all its members

### One-Tap Collection

1. Click the 📋 button in the sidebar header
2. All open tabs will be collected into a new group named with the current timestamp
3. All collected tabs will be automatically closed
4. A notification will confirm the collection

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Click` | Toggle individual tab selection |
| `Shift + Click` | Select range of tabs |
| `ESC` | Clear multi-select |
| `Delete/Backspace` | Remove selected members from groups |
| `Ctrl + B` | Toggle sidebar visibility |

## Preferences

Access preferences via `Edit -> Settings -> Tab Enhance`:

- **Enable Vertical Tabs**: Toggle the sidebar on/off
- **Enable Horizontal Tab Enhancement**: Toggle right-click menu enhancements
- **Reset Plugin Data**: Clear all saved groups and sidebar state

## Building from Source

```bash
# Clone the repository
git clone https://github.com/hyfaust/zotero-tab-enhance.git
cd zotero-tab-enhance

# Install dependencies
npm install

# Build the plugin
npm run build

# The built .xpi file will be in .scaffold/build/
```

## Development

```bash
# Start development server (hot reload)
npm start

# Run tests
npm test

# Lint and format
npm run lint:check
npm run lint:fix

# Release a new version
npm run release
```

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html).

Under the AGPL-3.0, you are free to:
- **Share** — copy and redistribute the material in any medium or format
- **Adapt** — remix, transform, and build upon the material

Under the following terms:
- **Attribution** — You must give appropriate credit
- **ShareAlike** — If you remix, transform, or build upon the material, you must distribute your contributions under the same license
- **Network Use is Distribution** — If you run a modified version on a network server, you must make the source code available to users

## Acknowledgments

- [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) for providing the development scaffold
- [Rphone/zotero-tab-enhance](https://github.com/Rphone/zotero-tab-enhance) — This project is a fork and major enhancement of the original Tab Enhance plugin. The initial codebase, architecture decisions, and core features (vertical sidebar, tab tracking, grouping system) were inherited from the original project. Significant new features, bug fixes, and performance optimizations have been added on top of that foundation.

## Reporting Issues

Found a bug or have a feature request? Please open an issue on [GitHub Issues](https://github.com/hyfaust/zotero-tab-enhance/issues).

Include:
- Your Zotero version
- Steps to reproduce the issue
- Expected vs. actual behavior
- Screenshots if applicable

## Version History

See [Releases](https://github.com/hyfaust/zotero-tab-enhance/releases) for the full changelog.
