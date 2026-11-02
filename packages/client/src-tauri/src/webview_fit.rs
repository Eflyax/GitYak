//! Keeps the WKWebView filling its window on macOS.
//!
//! The webview of a `WebviewWindow` follows the window only through AppKit autoresizing,
//! and on macOS Sequoia that occasionally misses a resize — typically the jump into
//! fullscreen — leaving the UI drawn at the old, smaller size until the page is reloaded
//! (tauri-apps/tauri#14843). Tauri's own `set_bounds` is a no-op for such a webview, so
//! the frame is corrected natively after every resize.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{Manager, Runtime, Window, WindowEvent};

/// Long enough for the fullscreen animation to finish; resizes inside it are coalesced.
const SETTLE_DELAY: Duration = Duration::from_millis(400);

static RESIZE_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Resized(_)) {
        return;
    }

    let app = window.app_handle().clone();
    let label = window.label().to_owned();

    fit(&app, &label, false);

    // Once resizing settles, nudge WebKit as well: when the frame is already right but the
    // page still lays out at the old viewport, only a real frame change makes it relayout.
    let generation = RESIZE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    std::thread::spawn(move || {
        std::thread::sleep(SETTLE_DELAY);

        if RESIZE_GENERATION.load(Ordering::SeqCst) == generation {
            fit(&app, &label, true);
        }
    });
}

#[cfg(target_os = "macos")]
fn fit<R: Runtime>(app: &tauri::AppHandle<R>, label: &str, nudge: bool) {
    use objc2_app_kit::NSView;
    use objc2_core_foundation::CGRect;

    let Some(window) = app.get_webview_window(label) else {
        return;
    };

    // `with_webview` runs the closure on the main thread, which AppKit requires.
    let _ = window.with_webview(move |platform| unsafe {
        let Some(view) = (platform.inner() as *const NSView).as_ref() else {
            return;
        };
        let Some(parent) = view.superview() else {
            return;
        };
        let bounds = parent.bounds();

        if nudge {
            let mut smaller: CGRect = bounds;
            smaller.size.height -= 1.0;
            view.setFrame(smaller);
        }

        view.setFrame(bounds);
    });
}

#[cfg(not(target_os = "macos"))]
fn fit<R: Runtime>(_app: &tauri::AppHandle<R>, _label: &str, _nudge: bool) {}
