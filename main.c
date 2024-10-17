#include <stdio.h>

#include <X11/Xlib.h>
#include <X11/X.h>

Window win;

int main(void)
{
    Display *dsp = XOpenDisplay(NULL);

    win = XCreateSimpleWindow(dsp, DefaultRootWindow(dsp), 0, 0, 1280, 720, 0, 0, 0)

        XMapWindow(dsp, win);
    XFlush(dsp);

    XEvent ev;

    while (1)
    {
        XNextEvent(dsp, &ev);
    }

    XDestroyWindow(dsp, win);
    XCloseDisplay(dsp);
}