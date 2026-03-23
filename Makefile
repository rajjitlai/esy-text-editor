CC = gcc
CFLAGS = -Wall $(shell pkg-config --cflags x11 xft fontconfig)
LIBS = $(shell pkg-config --libs x11 xft fontconfig)

all:
	$(CC) $(CFLAGS) -o editor *.c $(LIBS)
