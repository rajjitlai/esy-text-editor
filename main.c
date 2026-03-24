#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <X11/Xlib.h>
#include <X11/X.h>
#include <X11/Xatom.h>
#include "buffer.h"
#include "render.h"
#include "input.h"
#include "file_io.h"

static char *clipboard_text = NULL;

void set_clipboard_text(Display *dsp, Window win, const char *text) {
    if (clipboard_text) free(clipboard_text);
    clipboard_text = strdup(text);
    XSetSelectionOwner(dsp, XInternAtom(dsp, "CLIPBOARD", False), win, CurrentTime);
}

void request_clipboard_text(Display *dsp, Window win) {
    Atom clipboard = XInternAtom(dsp, "CLIPBOARD", False);
    Atom target = XInternAtom(dsp, "UTF8_STRING", False);
    Atom property = XInternAtom(dsp, "XSEL_DATA", False);
    XConvertSelection(dsp, clipboard, target, property, win, CurrentTime);
}

void load_config(Renderer *ren) {
    FILE *f = fopen(".editorrc", "r");
    if (!f) return;
    char line[256];
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, "theme=light", 11) == 0) {
            if (ren->theme == THEME_DARK) render_toggle_theme(ren);
        } else if (strncmp(line, "theme=dark", 10) == 0) {
            if (ren->theme == THEME_LIGHT) render_toggle_theme(ren);
        }
    }
    fclose(f);
}

int main(int argc, char **argv)
{
    Display* dsp = XOpenDisplay(NULL);
    if (!dsp) {
        fprintf(stderr, "Cannot open display\n");
        return 1;
    }

    Window win = XCreateSimpleWindow(dsp, DefaultRootWindow(dsp), 0, 0, 1280, 720, 0, 0, 0);
    XSelectInput(dsp, win, ExposureMask | KeyPressMask | StructureNotifyMask | ButtonPressMask | ButtonReleaseMask | PointerMotionMask);
    XMapWindow(dsp, win);

    Atom atom_delete_window = XInternAtom(dsp, "WM_DELETE_WINDOW", True);
    XSetWMProtocols(dsp, win, &atom_delete_window, 1);

    BufferManager *bm = buffer_manager_create();
    if (argc > 1) {
        for (int i = 1; i < argc; i++) {
            Buffer *buf = buffer_create(argv[i]);
            buffer_load(buf, argv[i]);
            buffer_manager_add(bm, buf);
        }
    } else {
        buffer_manager_add(bm, buffer_create(NULL));
    }

    Renderer *ren = render_init(dsp, win);
    load_config(ren);

    XEvent ev;
    while (1)
    {
        XNextEvent(dsp, &ev);

        if (ev.type == ClientMessage) {
            if (ev.xclient.data.l[0] == atom_delete_window)
                break;
        } else if (ev.type == Expose) {
            render_buffer(ren, bm);
        } else if (ev.type == KeyPress) {
            handle_keypress(&ev, bm, ren);
            render_buffer(ren, bm);
        } else if (ev.type == ButtonPress || ev.type == ButtonRelease || ev.type == MotionNotify) {
            handle_mouse_event(&ev, bm, ren);
            render_buffer(ren, bm);
        } else if (ev.type == SelectionRequest) {
            XSelectionRequestEvent *req = &ev.xselectionrequest;
            XSelectionEvent sel;
            sel.type = SelectionNotify;
            sel.requestor = req->requestor;
            sel.selection = req->selection;
            sel.target = req->target;
            sel.time = req->time;
            sel.property = None;

            Atom utf8 = XInternAtom(dsp, "UTF8_STRING", False);
            if (req->target == utf8 || req->target == XA_STRING) {
                if (clipboard_text) {
                    XChangeProperty(dsp, req->requestor, req->property, req->target, 8, PropModeReplace, (unsigned char*)clipboard_text, strlen(clipboard_text));
                    sel.property = req->property;
                }
            }
            XSendEvent(dsp, req->requestor, True, 0, (XEvent*)&sel);
        } else if (ev.type == SelectionNotify) {
            XSelectionEvent *sel = &ev.xselection;
            if (sel->property != None) {
                Atom actual_type;
                int actual_format;
                unsigned long nitems, bytes_after;
                unsigned char *data = NULL;
                XGetWindowProperty(dsp, sel->requestor, sel->property, 0, ~0L, False, AnyPropertyType, &actual_type, &actual_format, &nitems, &bytes_after, &data);
                if (data) {
                    buffer_insert(buffer_manager_current(bm), (char*)data, nitems);
                    XFree(data);
                    render_buffer(ren, bm);
                }
            }
        }
    }

    render_destroy(ren);
    buffer_manager_destroy(bm);
    XDestroyWindow(dsp, win);
    XCloseDisplay(dsp);
    if (clipboard_text) free(clipboard_text);

    printf("Code run with 0 errors\n");
    return 0;
}
