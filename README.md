# esy-text-editor

A lightweight, modern text editor built with C and X11 (Xlib/Xft). This editor uses a **Gap Buffer** for efficient text manipulation and features anti-aliased font rendering via **Xft**.

## 🚀 Features

-   **High Performance:** Uses a Gap Buffer for $O(1)$ insertions and deletions at the cursor.
-   **Modern Rendering:** Beautiful, anti-aliased text rendering using the Xft library.
-   **UTF-8 Support:** Full support for multi-byte characters (emojis, symbols, etc.).
-   **Visual Selection:** Hold `Shift` while navigating to select and highlight text.
-   **System Clipboard:** Seamless Copy (`Ctrl+C`), Cut (`Ctrl+X`), and Paste (`Ctrl+V`) integration with other applications.
-   **Multiple Tabs:** Open several files at once and cycle through them with the `Tab` key.
-   **Integrated Search:** Search within the buffer using `Ctrl+F` and jump to next matches with `F3`.
-   **Command Palette:** Access powerful commands via `Ctrl+Shift+P`.
-   **Line Numbers:** A dynamic gutter that follows your text.
-   **Theming:** Toggle between Dark and Light modes instantly with `Ctrl+L`.

## 🛠️ Installation & Build

To compile the editor on a Linux system (like Zorin OS, Ubuntu, or Debian), you will need the X11 and Xft development headers.

### 1. Install Dependencies
```bash
sudo apt update
sudo apt install build-essential libx11-dev libxft-dev libfontconfig1-dev pkg-config
```

### 2. Compile
```bash
make
```

### 3. Run
```bash
./editor [filename1] [filename2] ...
```

## ⌨️ Controls

| Key | Action |
| :--- | :--- |
| **Arrow Keys** | Navigate text |
| **Ctrl + Left/Right** | Jump between words |
| **Shift + Arrows** | Select text |
| **Home / End** | Jump to start/end of line |
| **Page Up/Down** | Scroll up/down 10 lines |
| **Tab** | Switch to the next open file/tab |
| **Ctrl + S** | Save the current file |
| **Ctrl + T** | Open a new empty tab |
| **Ctrl + L** | Toggle Dark/Light theme |
| **Ctrl + F** | Search text |
| **F3** | Find next occurrence |
| **Ctrl + Shift + P** | Open Command Palette |

### 🛠️ Command Palette Commands
Open with `Ctrl + Shift + P`, type the command, and press `Return`:
- `save` : Save current file.
- `quit` : Exit the editor.
- `theme`: Toggle the theme.
- `goto <number>`: Jump to a specific line (e.g., `goto 10`).
- `next` / `prev`: Cycle through tabs.

## ⚙️ Configuration
The editor looks for a `.editorrc` file in the execution directory.
Example `.editorrc`:
```text
theme=dark
```

## 📜 License
MIT
