#include "input.h"
#include "file_io.h"
#include <X11/keysym.h>
#include <stdio.h>
void handle_keypress(XEvent *ev, BufferManager *bm, Renderer *ren) {
    Buffer *buf = buffer_manager_current(bm);
    if (!buf) return;

    char str[16];
    KeySym sym;
    int n = XLookupString(&ev->xkey, str, sizeof(str), &sym, NULL);

    // Modal input handling
    if (ren->mode != MODE_NORMAL) {
        if (sym == XK_Escape) {
            ren->mode = MODE_NORMAL;
            memset(ren->modal_buffer, 0, sizeof(ren->modal_buffer));
            return;
        } else if (sym == XK_Return) {
            if (ren->mode == MODE_COMMAND) {
                if (strcmp(ren->modal_buffer, "quit") == 0) exit(0);
                else if (strcmp(ren->modal_buffer, "save") == 0) {
                    if (buf->filename) {
                        buffer_save(buf, buf->filename);
                        buf->modified = 0;
                    }
                } else if (strcmp(ren->modal_buffer, "theme") == 0) {
                    render_toggle_theme(ren);
                } else if (strcmp(ren->modal_buffer, "next") == 0) {
                    buffer_manager_next(bm);
                } else if (strcmp(ren->modal_buffer, "prev") == 0) {
                    buffer_manager_prev(bm);
                } else if (strncmp(ren->modal_buffer, "goto ", 5) == 0) {
                    int target_line = atoi(ren->modal_buffer + 5);
                    buffer_move_to_line(buf, target_line);
                }
            } else if (ren->mode == MODE_SEARCH) {
                size_t pos = buffer_find(buf, ren->modal_buffer, 0);
                if (pos != (size_t)-1) {
                    while (buffer_get_cursor_pos(buf) > pos) buffer_move_cursor_left(buf);
                    while (buffer_get_cursor_pos(buf) < pos) buffer_move_cursor_right(buf);
                }
            }
            ren->mode = MODE_NORMAL;
            memset(ren->modal_buffer, 0, sizeof(ren->modal_buffer));
            return;
        }
 else if (sym == XK_BackSpace) {
            int len = strlen(ren->modal_buffer);
            if (len > 0) ren->modal_buffer[len - 1] = '\0';
            return;
        } else if (n > 0 && str[0] >= 32) {
            strncat(ren->modal_buffer, str, n);
            return;
        }
        return;
    }

    if (ev->xkey.state & ControlMask) {
        if (sym == XK_s) {
            if (buf->filename) {
                buffer_save(buf, buf->filename);
                buf->modified = 0;
                printf("Saved %s\n", buf->filename);
            }
            return;
        } else if (sym == XK_t) {
            buffer_manager_add(bm, buffer_create(NULL));
            return;
        } else if (sym == XK_l) {
            render_toggle_theme(ren);
            return;
        } else if (sym == XK_f) {
            ren->mode = MODE_SEARCH;
            return;
        } else if (sym == XK_P && (ev->xkey.state & ShiftMask)) {
            ren->mode = MODE_COMMAND;
            return;
        } else if (sym == XK_c) {
...

            if (buf->selecting) {
                size_t start, end;
                buffer_get_selection_range(buf, &start, &end);
                char *text = buffer_get_text_range(buf, start, end);
                if (text) {
                    set_clipboard_text(ren->dsp, ren->win, text);
                    free(text);
                }
            }
            return;
        } else if (sym == XK_x) {
            if (buf->selecting) {
                size_t start, end;
                buffer_get_selection_range(buf, &start, &end);
                char *text = buffer_get_text_range(buf, start, end);
                if (text) {
                    set_clipboard_text(ren->dsp, ren->win, text);
                    buffer_delete_range(buf, start, end);
                    buf->selecting = 0;
                    free(text);
                }
            }
            return;
        } else if (sym == XK_v) {
            request_clipboard_text(ren->dsp, ren->win);
            return;
        }
    }

    if (n > 0) {
        if (str[0] == '\b' || str[0] == 127) { // Backspace or DEL
            buffer_delete(buf);
            buf->selecting = 0;
        } else if (str[0] == '\r' || str[0] == '\n') { // Enter
            buffer_insert(buf, "\n", 1);
            buf->selecting = 0;
        } else {
            buffer_insert(buf, str, n);
            buf->selecting = 0;
        }
    } else {
        int shift = ev->xkey.state & ShiftMask;
        if (shift && !buf->selecting) {
            buf->selecting = 1;
            buf->selection_start = buffer_get_cursor_pos(buf);
        } else if (!shift) {
            buf->selecting = 0;
        }

        switch (sym) {
            case XK_F3: {
                size_t current_pos = buffer_get_cursor_pos(buf);
                size_t pos = buffer_find(buf, ren->modal_buffer, current_pos + 1);
                if (pos == (size_t)-1) pos = buffer_find(buf, ren->modal_buffer, 0); // wrap
                if (pos != (size_t)-1) {
                    while (buffer_get_cursor_pos(buf) > pos) buffer_move_cursor_left(buf);
                    while (buffer_get_cursor_pos(buf) < pos) buffer_move_cursor_right(buf);
                }
                break;
            }
            case XK_Left:
                if (ev->xkey.state & ControlMask) {
                    while (buf->gap_start > 0 && buf->data[buf->gap_start-1] == ' ') buffer_move_cursor_left(buf);
                    while (buf->gap_start > 0 && buf->data[buf->gap_start-1] != ' ') buffer_move_cursor_left(buf);
                } else {
                    buffer_move_cursor_left(buf);
                }
                break;
            case XK_Right:
                if (ev->xkey.state & ControlMask) {
                    while (buf->gap_end < buf->size && buf->data[buf->gap_end] == ' ') buffer_move_cursor_right(buf);
                    while (buf->gap_end < buf->size && buf->data[buf->gap_end] != ' ') buffer_move_cursor_right(buf);
                } else {
                    buffer_move_cursor_right(buf);
                }
                break;
            case XK_Up:    buffer_move_cursor_up(buf); break;
            case XK_Down:  buffer_move_cursor_down(buf); break;
            case XK_Home:  buffer_move_to_line_start(buf); break;
            case XK_End:   buffer_move_to_line_end(buf); break;
            case XK_Prior: for(int i=0; i<10; i++) buffer_move_cursor_up(buf); break;
            case XK_Next:  for(int i=0; i<10; i++) buffer_move_cursor_down(buf); break;
            case XK_Tab:   buffer_manager_next(bm); break; // Cycle buffers
        }
    }
}
