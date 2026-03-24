#ifndef RENDER_H
#define RENDER_H

#include <X11/Xlib.h>
#include <X11/Xft/Xft.h>
#include "buffer.h"

typedef enum {
    THEME_DARK,
    THEME_LIGHT
} Theme;

typedef enum {
    MODE_NORMAL,
    MODE_COMMAND,
    MODE_SEARCH
} InputMode;

#define MENU_HEIGHT 30
#define SCROLLBAR_WIDTH 15

typedef struct {
    Display *dsp;
    Window win;
    Visual *visual;
    Colormap cmap;
    XftDraw *draw;
    XftFont *font;
    XftColor color;
    XftColor bg_color;
    XftColor accent_color;
    XftColor selection_color;
    int scroll_y;
    Theme theme;
    InputMode mode;
    char modal_buffer[256];
    int menu_open;
    int dragging_scrollbar;
} Renderer;

Renderer* render_init(Display *dsp, Window win);
void render_destroy(Renderer *ren);
void render_buffer(Renderer *ren, BufferManager *bm);
void render_toggle_theme(Renderer *ren);

#endif
