#include "render.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

static int utf8_char_len(unsigned char c) {
    if ((c & 0x80) == 0) return 1;
    if ((c & 0xE0) == 0xC0) return 2;
    if ((c & 0xF0) == 0xE0) return 3;
    if ((c & 0xF8) == 0xF0) return 4;
    return 1;
}

Renderer* render_init(Display *dsp, Window win) {
    Renderer *ren = malloc(sizeof(Renderer));
    ren->dsp = dsp;
    ren->win = win;
    ren->theme = THEME_DARK;

    XWindowAttributes attrs;
    XGetWindowAttributes(dsp, win, &attrs);
    ren->visual = attrs.visual;
    ren->cmap = attrs.colormap;

    ren->draw = XftDrawCreate(dsp, win, ren->visual, ren->cmap);
    ren->font = XftFontOpenName(dsp, DefaultScreen(dsp), "monospace-12");

    XftColorAllocName(dsp, ren->visual, ren->cmap, "white", &ren->color);
    XftColorAllocName(dsp, ren->visual, ren->cmap, "black", &ren->bg_color);
    XftColorAllocName(dsp, ren->visual, ren->cmap, "yellow", &ren->accent_color);
    XftColorAllocName(dsp, ren->visual, ren->cmap, "#333333", &ren->selection_color);

    ren->scroll_y = 0;
    ren->mode = MODE_NORMAL;
    ren->menu_open = 0;
    ren->dragging_scrollbar = 0;
    ren->show_about = 0;
    memset(ren->modal_buffer, 0, sizeof(ren->modal_buffer));
    memset(ren->find_buffer, 0, sizeof(ren->find_buffer));

    return ren;
}

void render_destroy(Renderer *ren) {
    if (ren) {
        XftFontClose(ren->dsp, ren->font);
        XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->color);
        XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->bg_color);
        XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->accent_color);
        XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->selection_color);
        XftDrawDestroy(ren->draw);
        free(ren);
    }
}

void render_buffer(Renderer *ren, BufferManager *bm) {
    Buffer *buf = buffer_manager_current(bm);
    if (!buf) return;

    XWindowAttributes attrs;
    XGetWindowAttributes(ren->dsp, ren->win, &attrs);
    int win_width = attrs.width;
    int win_height = attrs.height;

    XftDrawRect(ren->draw, &ren->bg_color, 0, 0, win_width, win_height);

    int line_height = ren->font->ascent + ren->font->descent;
    int status_bar_height = line_height + 10;

    // Render Menu Bar
    XftDrawRect(ren->draw, &ren->selection_color, 0, 0, win_width, MENU_HEIGHT);
    XftDrawRect(ren->draw, &ren->accent_color, 0, MENU_HEIGHT - 1, win_width, 1);
    const char *menus[] = {"File", "Edit", "View", "Help"};
    int menu_x = 10;
    for (int i = 0; i < 4; i++) {
        XftDrawString8(ren->draw, &ren->color, ren->font, menu_x, 20, (XftChar8*)menus[i], strlen(menus[i]));
        menu_x += 60;
    }

    // Calculate gutter width
    int total_lines = buffer_get_total_lines(buf);
    char line_num_str[16];
    snprintf(line_num_str, sizeof(line_num_str), "%d", total_lines);
    int gutter_width = (strlen(line_num_str) + 2) * ren->font->max_advance_width;

    size_t sel_min = 0, sel_max = 0;
    if (buf->selecting) {
        buffer_get_selection_range(buf, &sel_min, &sel_max);
    }

    // First pass: find cursor pixel coordinates
    int cursor_pixel_x = gutter_width + 10;
    int cursor_pixel_y = MENU_HEIGHT + 50;
    for (size_t i = 0; i < buf->gap_start; ) {
        unsigned char c = (unsigned char)buf->data[i];
        if (c == '\n') {
            cursor_pixel_x = gutter_width + 10;
            cursor_pixel_y += line_height;
            i++;
        } else {
            int len = utf8_char_len(c);
            cursor_pixel_x += ren->font->max_advance_width;
            i += len;
        }
    }

    if (cursor_pixel_y - ren->scroll_y < MENU_HEIGHT + 50) {
        ren->scroll_y = cursor_pixel_y - (MENU_HEIGHT + 50);
    } else if (cursor_pixel_y - ren->scroll_y > win_height - status_bar_height - line_height) {
        ren->scroll_y = cursor_pixel_y - (win_height - status_bar_height - line_height);
    }

    // Render Tab Bar
    int tab_x = 10;
    int tab_y = MENU_HEIGHT + 20;
    for (size_t i = 0; i < bm->count; i++) {
        const char *name = bm->buffers[i]->filename ? bm->buffers[i]->filename : "[New]";
        XftColor tab_color = (i == bm->current) ? ren->accent_color : ren->color;
        char tab_label[256];
        if (bm->buffers[i]->modified) {
            snprintf(tab_label, sizeof(tab_label), "%s *", name);
        } else {
            snprintf(tab_label, sizeof(tab_label), "%s", name);
        }
        XftDrawString8(ren->draw, &tab_color, ren->font, tab_x, tab_y, (XftChar8*)tab_label, strlen(tab_label));
        tab_x += strlen(tab_label) * 10 + 20;
    }

    // Draw Gutter Background
    XftDrawRect(ren->draw, &ren->selection_color, 0, MENU_HEIGHT + 30, gutter_width, win_height - status_bar_height - (MENU_HEIGHT + 30));

    int x = gutter_width + 10;
    int y = MENU_HEIGHT + 50 - ren->scroll_y;
    int current_line_num = 1;

    // Draw first line number
    snprintf(line_num_str, sizeof(line_num_str), "%d", current_line_num);
    XftDrawString8(ren->draw, &ren->accent_color, ren->font, 5, y, (XftChar8*)line_num_str, strlen(line_num_str));

    // Render pre-gap
    for (size_t i = 0; i < buf->gap_start; ) {
        unsigned char c = (unsigned char)buf->data[i];
        int len = utf8_char_len(c);
        
        if (buf->selecting && i >= sel_min && i < sel_max) {
            XftDrawRect(ren->draw, &ren->selection_color, x, y - ren->font->ascent, ren->font->max_advance_width, line_height);
        }

        if (c == '\n') {
            current_line_num++;
            x = gutter_width + 10;
            y += line_height;
            if (y > MENU_HEIGHT + 30 && y < win_height - status_bar_height + line_height) {
                snprintf(line_num_str, sizeof(line_num_str), "%d", current_line_num);
                XftDrawString8(ren->draw, &ren->accent_color, ren->font, 5, y, (XftChar8*)line_num_str, strlen(line_num_str));
            }
            i++;
        } else {
            if (y > MENU_HEIGHT + 30 && y < win_height - status_bar_height + line_height) {
                XftDrawStringUtf8(ren->draw, &ren->color, ren->font, x, y, (FcChar8*)&buf->data[i], len);
            }
            x += ren->font->max_advance_width;
            i += len;
        }
    }
    
    // Draw Cursor
    XftColor cursor_color;
    XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "red", &cursor_color);
    XftDrawRect(ren->draw, &cursor_color, x, y - ren->font->ascent, 2, line_height);
    XftColorFree(ren->dsp, ren->visual, ren->cmap, &cursor_color);

    // Render post-gap
    for (size_t i = buf->gap_end; i < buf->size; ) {
        unsigned char c = (unsigned char)buf->data[i];
        int len = utf8_char_len(c);
        
        size_t real_idx = i - (buf->gap_end - buf->gap_start);
        if (buf->selecting && real_idx >= sel_min && real_idx < sel_max) {
             XftDrawRect(ren->draw, &ren->selection_color, x, y - ren->font->ascent, ren->font->max_advance_width, line_height);
        }

        if (c == '\n') {
            current_line_num++;
            x = gutter_width + 10;
            y += line_height;
            if (y > MENU_HEIGHT + 30 && y < win_height - status_bar_height + line_height) {
                snprintf(line_num_str, sizeof(line_num_str), "%d", current_line_num);
                XftDrawString8(ren->draw, &ren->accent_color, ren->font, 5, y, (XftChar8*)line_num_str, strlen(line_num_str));
            }
            i++;
        } else {
            if (y > MENU_HEIGHT + 30 && y < win_height - status_bar_height + line_height) {
                XftDrawStringUtf8(ren->draw, &ren->color, ren->font, x, y, (FcChar8*)&buf->data[i], len);
            }
            x += ren->font->max_advance_width;
            i += len;
        }
    }

    // Render Scrollbar
    int sb_x = win_width - SCROLLBAR_WIDTH;
    int sb_y = MENU_HEIGHT + 30;
    int sb_h = win_height - status_bar_height - sb_y;
    XftDrawRect(ren->draw, &ren->selection_color, sb_x, sb_y, SCROLLBAR_WIDTH, sb_h);
    
    int content_h = total_lines * line_height;
    if (content_h > sb_h) {
        int thumb_h = (sb_h * sb_h) / content_h;
        if (thumb_h < 20) thumb_h = 20;
        int thumb_y = sb_y + (ren->scroll_y * (sb_h - thumb_h)) / (content_h - sb_h + 1);
        XftDrawRect(ren->draw, &ren->accent_color, sb_x + 2, thumb_y, SCROLLBAR_WIDTH - 4, thumb_h);
    }

    // Status Bar
    int sb_text_y = win_height - 5;
    int line, col;
    buffer_get_line_col(buf, &line, &col);
    char status[256];
    snprintf(status, sizeof(status), "Line: %d, Col: %d | %s", line, col, buf->filename ? buf->filename : "Untitled");
    
    XftDrawRect(ren->draw, &ren->accent_color, 0, win_height - status_bar_height, win_width, 1);
    XftDrawString8(ren->draw, &ren->color, ren->font, 10, sb_text_y, (XftChar8*)status, strlen(status));

    // Modal
    if (ren->mode != MODE_NORMAL) {
        int modal_h = line_height + 20;
        int modal_y = win_height - status_bar_height - modal_h - 10;
        XftDrawRect(ren->draw, &ren->bg_color, 0, modal_y, win_width, modal_h);
        XftDrawRect(ren->draw, &ren->accent_color, 0, modal_y, win_width, 1);
        char prompt[300];
        if (ren->mode == MODE_COMMAND) snprintf(prompt, sizeof(prompt), "Command: %s", ren->modal_buffer);
        else if (ren->mode == MODE_SEARCH) snprintf(prompt, sizeof(prompt), "Search: %s", ren->modal_buffer);
        else if (ren->mode == MODE_SAVE_AS) snprintf(prompt, sizeof(prompt), "Save As: %s", ren->modal_buffer);
        else if (ren->mode == MODE_REPLACE_FIND) snprintf(prompt, sizeof(prompt), "Find: %s", ren->modal_buffer);
        else if (ren->mode == MODE_REPLACE_WITH) snprintf(prompt, sizeof(prompt), "Replace with: %s", ren->modal_buffer);
        XftDrawString8(ren->draw, &ren->color, ren->font, 10, modal_y + line_height + 5, (XftChar8*)prompt, strlen(prompt));
    }

    // Render Dropdown Menu if open
    if (ren->menu_open > 0) {
        const char *items[][6] = {
            {"New", "Save", "Save As", "Close", "Quit", NULL},
            {"Cut", "Copy", "Paste", "Find", "Replace", NULL},
            {"Toggle Theme", NULL},
            {"About", NULL}
        };
        int menu_idx = ren->menu_open - 1;
        int x_off = 10 + (menu_idx * 60);
        int item_h = line_height + 10;
        int count = 0;
        while (items[menu_idx][count]) count++;

        int menu_w = 120;
        int menu_h = count * item_h;

        // Draw Shadow/Background
        XftDrawRect(ren->draw, &ren->selection_color, x_off, MENU_HEIGHT, menu_w, menu_h);
        XftDrawRect(ren->draw, &ren->accent_color, x_off, MENU_HEIGHT, menu_w, 1); // Top border
        XftDrawRect(ren->draw, &ren->accent_color, x_off, MENU_HEIGHT, 1, menu_h); // Left border
        XftDrawRect(ren->draw, &ren->accent_color, x_off + menu_w - 1, MENU_HEIGHT, 1, menu_h); // Right border
        XftDrawRect(ren->draw, &ren->accent_color, x_off, MENU_HEIGHT + menu_h - 1, menu_w, 1); // Bottom border

        for (int i = 0; i < count; i++) {
            XftDrawString8(ren->draw, &ren->color, ren->font, x_off + 10, MENU_HEIGHT + (i + 1) * item_h - 10, (XftChar8*)items[menu_idx][i], strlen(items[menu_idx][i]));
        }
    }

    // Render About Popup
    if (ren->show_about) {
        int popup_w = 400;
        int popup_h = 150;
        int popup_x = (win_width - popup_w) / 2;
        int popup_y = (win_height - popup_h) / 2;

        XftDrawRect(ren->draw, &ren->bg_color, popup_x, popup_y, popup_w, popup_h);
        XftDrawRect(ren->draw, &ren->accent_color, popup_x, popup_y, popup_w, 2);
        XftDrawRect(ren->draw, &ren->accent_color, popup_x, popup_y + popup_h - 2, popup_w, 2);
        XftDrawRect(ren->draw, &ren->accent_color, popup_x, popup_y, 2, popup_h);
        XftDrawRect(ren->draw, &ren->accent_color, popup_x + popup_w - 2, popup_y, 2, popup_h);

        XftDrawString8(ren->draw, &ren->accent_color, ren->font, popup_x + 20, popup_y + 40, (XftChar8*)"About esy-text-editor", 21);
        XftDrawString8(ren->draw, &ren->color, ren->font, popup_x + 20, popup_y + 80, (XftChar8*)"A lightweight C/X11 Text Editor", 31);
        XftDrawString8(ren->draw, &ren->color, ren->font, popup_x + 20, popup_y + 120, (XftChar8*)"[Click anywhere to close]", 25);
    }
}

void render_toggle_theme(Renderer *ren) {
    XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->color);
    XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->bg_color);
    XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->accent_color);
    XftColorFree(ren->dsp, ren->visual, ren->cmap, &ren->selection_color);

    if (ren->theme == THEME_DARK) {
        ren->theme = THEME_LIGHT;
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "black", &ren->color);
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "#dddddd", &ren->bg_color);
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "blue", &ren->accent_color);
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "#bbbbbb", &ren->selection_color);
    } else {
        ren->theme = THEME_DARK;
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "white", &ren->color);
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "black", &ren->bg_color);
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "yellow", &ren->accent_color);
        XftColorAllocName(ren->dsp, ren->visual, ren->cmap, "#333333", &ren->selection_color);
    }
}
