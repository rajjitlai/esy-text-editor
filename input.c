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
            } else if (ren->mode == MODE_SAVE_AS) {
                if (buf->filename) free(buf->filename);
                buf->filename = strdup(ren->modal_buffer);
                buffer_save(buf, buf->filename);
                buf->modified = 0;
            } else if (ren->mode == MODE_REPLACE_FIND) {
                strcpy(ren->find_buffer, ren->modal_buffer);
                ren->mode = MODE_REPLACE_WITH;
                memset(ren->modal_buffer, 0, sizeof(ren->modal_buffer));
                return; // Don't clear modal_buffer or switch to NORMAL yet
            } else if (ren->mode == MODE_REPLACE_WITH) {
                size_t pos = buffer_find(buf, ren->find_buffer, 0);
                if (pos != (size_t)-1) {
                    buffer_delete_range(buf, pos, pos + strlen(ren->find_buffer));
                    // Move cursor to pos for insertion
                    while (buffer_get_cursor_pos(buf) > pos) buffer_move_cursor_left(buf);
                    while (buffer_get_cursor_pos(buf) < pos) buffer_move_cursor_right(buf);
                    buffer_insert(buf, ren->modal_buffer, strlen(ren->modal_buffer));
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

void handle_mouse_event(XEvent *ev, BufferManager *bm, Renderer *ren) {
    Buffer *buf = buffer_manager_current(bm);
    if (!buf) return;

    XWindowAttributes attrs;
    XGetWindowAttributes(ren->dsp, ren->win, &attrs);
    int win_width = attrs.width;
    int win_height = attrs.height;
    int line_height = ren->font->ascent + ren->font->descent;
    int status_bar_height = line_height + 10;
    int sb_y_start = MENU_HEIGHT + 30;
    int sb_height = win_height - status_bar_height - sb_y_start;

    if (ev->type == ButtonPress) {
        int x = ev->xbutton.x;
        int y = ev->xbutton.y;

        if (ren->show_about) {
            ren->show_about = 0;
            return;
        }

        // If a menu is already open, check if an item was clicked
        if (ren->menu_open > 0) {
            int menu_idx = ren->menu_open - 1;
            int x_off = 10 + (menu_idx * 60);
            int menu_w = 120;
            int item_h = line_height + 10;
            
            // Define counts for each menu
            int counts[] = {5, 5, 1, 1}; // File:5, Edit:5, View:1, Help:1
            int count = counts[menu_idx];
            int menu_h = count * item_h;

            if (x >= x_off && x < x_off + menu_w && y >= MENU_HEIGHT && y < MENU_HEIGHT + menu_h) {
                int item_clicked = (y - MENU_HEIGHT) / item_h;
                
                if (ren->menu_open == 1) { // File
                    if (item_clicked == 0) buffer_manager_add(bm, buffer_create(NULL)); // New
                    else if (item_clicked == 1 && buf->filename) buffer_save(buf, buf->filename); // Save
                    else if (item_clicked == 2) ren->mode = MODE_SAVE_AS; // Save As
                    else if (item_clicked == 3) buffer_manager_close_current(bm); // Close
                    else if (item_clicked == 4) exit(0); // Quit
                } else if (ren->menu_open == 2) { // Edit
                    if (item_clicked == 0) { // Cut
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
                    } else if (item_clicked == 1) { // Copy
                        if (buf->selecting) {
                            size_t start, end;
                            buffer_get_selection_range(buf, &start, &end);
                            char *text = buffer_get_text_range(buf, start, end);
                            if (text) {
                                set_clipboard_text(ren->dsp, ren->win, text);
                                free(text);
                            }
                        }
                    } else if (item_clicked == 2) { // Paste
                        request_clipboard_text(ren->dsp, ren->win);
                    } else if (item_clicked == 3) { // Find
                        ren->mode = MODE_SEARCH;
                    } else if (item_clicked == 4) { // Replace
                        ren->mode = MODE_REPLACE_FIND;
                    }
                } else if (ren->menu_open == 3) { // View
                    if (item_clicked == 0) render_toggle_theme(ren);
                } else if (ren->menu_open == 4) { // Help
                    if (item_clicked == 0) ren->show_about = 1;
                }
            }
            ren->menu_open = 0; // Close menu after any click
            return;
        }

        // Check Menu Bar
        if (y < MENU_HEIGHT) {
            if (x < 70) ren->menu_open = 1;
            else if (x < 130) ren->menu_open = 2;
            else if (x < 190) ren->menu_open = 3;
            else if (x < 250) ren->menu_open = 4;
            return;
        }

        // Check Scrollbar
        if (x >= win_width - SCROLLBAR_WIDTH && y >= sb_y_start && y < win_height - status_bar_height) {
            ren->dragging_scrollbar = 1;
        }
    } else if (ev->type == ButtonRelease) {
        ren->dragging_scrollbar = 0;
    } else if (ev->type == MotionNotify) {
        if (ren->dragging_scrollbar) {
            int y = ev->xmotion.y;
            int total_lines = buffer_get_total_lines(buf);
            int content_h = total_lines * line_height;
            if (content_h > sb_height) {
                int relative_y = y - sb_y_start;
                if (relative_y < 0) relative_y = 0;
                if (relative_y > sb_height) relative_y = sb_height;
                ren->scroll_y = (relative_y * content_h) / sb_height;
            }
        }
    }
}
