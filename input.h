#ifndef INPUT_H
#define INPUT_H

#include <X11/Xlib.h>
#include "buffer.h"
#include "render.h"

void handle_keypress(XEvent *ev, BufferManager *bm, Renderer *ren);

void set_clipboard_text(Display *dsp, Window win, const char *text);
void request_clipboard_text(Display *dsp, Window win);

#endif
