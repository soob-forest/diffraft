#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <stdbool.h>

typedef bool (*CloseRequest)(void);
static CloseRequest requestClose;

static NSApplicationTerminateReply shouldTerminate(id self, SEL command, NSApplication *app) {
    (void)self;
    (void)command;
    (void)app;
    // AppKit invokes this on the main thread. Never block it on WebView IPC.
    return requestClose() ? NSTerminateCancel : NSTerminateNow;
}

bool docreview_install_termination_guard(CloseRequest callback) {
    if (![NSThread isMainThread] || callback == NULL || requestClose != NULL) return false;
    id delegate = NSApp.delegate;
    if (delegate == nil) return false;
    Class delegateClass = object_getClass(delegate);
    SEL selector = @selector(applicationShouldTerminate:);
    // Preserve existing runtime behavior; a future delegate implementation needs review.
    if (class_getInstanceMethod(delegateClass, selector) != NULL) return false;
    struct objc_method_description method = protocol_getMethodDescription(
        @protocol(NSApplicationDelegate), selector, NO, YES);
    if (method.types == NULL) return false;
    requestClose = callback;
    if (class_addMethod(delegateClass, selector, (IMP)shouldTerminate, method.types)) return true;
    requestClose = NULL;
    return false;
}

#ifdef DOCREVIEW_E2E
void docreview_request_native_exit(void) {
    [NSApp terminate:nil];
}
#endif
