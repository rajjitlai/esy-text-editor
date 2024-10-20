#include <stdio.h>

#include <X11/Xlib.h>
#include <X11/X.h>

Window win;

int main(void)
{
    Display* dsp = XOpenDisplay(NULL);

    win = XCreateSimpleWindow(dsp, DefaultRootWindow(dsp), 0, 0, 1280, 720, 0, 0, 0);

    XMapWindow(dsp, win);

    Atom atom_delete_window = XInternAtom(dsp, "WM_DELETE_WINDOW", True);
    XSetWMProtocols(dsp, win, &atom_delete_window, 1);

    XFlush(dsp);

    XEvent ev;

    while (1)
    {
        XNextEvent(dsp, &ev);

        if(ev.type=ClientMessage){
            if(ev.xclient.data.l[0] == atom_delete_window)
                break;
        }
    }

    XDestroyWindow(dsp, win);
    XCloseDisplay(dsp);


    printf("Code run with 0 errors\n");
    return 0;
}