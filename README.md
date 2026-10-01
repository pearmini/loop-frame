# Loopframe

Loopframe is a desktop player for exhibitions and installations. It keeps a list of websites and shows them one after another in full screen, including projects that use the camera.

The active website is loaded in an Electron `WebContentsView`, not an iframe, so a site that refuses to be embedded can still play.

## Setup

Install [Node.js](https://nodejs.org/) 20 or newer, then:

```bash
npm install
npm run dev
```

`npm start` does the same thing. Both compile TypeScript and open the settings window.

```bash
npm test
npm run test:self
```

`npm test` checks settings, timing, permissions, and playback rules without opening a window. `npm run test:self` opens Loopframe, exercises saved settings, permission decisions, page timing, cleanup, and fullscreen exit, then quits.

## Settings

- Add, remove, and reorder websites with the arrow buttons.
- Set how many seconds to show each website. The clock starts when that page finishes loading.
- Addresses must be full `https://` or `http://` URLs. The row explains what to fix, and Play stays off until every row is valid.
- **Start loop when computer starts** registers Loopframe to open when you log in. Turning it off removes that registration.
- **Camera** is on for listed websites unless you turn it off. **Microphone** stays off unless you turn it on.
- Play saves the list and opens the loop in full screen.
- Settings are stored in the app’s user-data folder and restored the next time Loopframe opens.

## Playback

Each website stays up for its duration. The clock starts when the page finishes loading, not when navigation starts. After the last website, the loop returns to the first.

If a page fails or does not finish loading within 20 seconds, Loopframe shows a short error and moves on. One broken address does not stop the loop.

Move the pointer to show Previous, Pause, Next, and Exit. The controls hide after a couple of seconds of stillness so the page can receive clicks. Pause keeps the controls visible and freezes the countdown; the website itself keeps running. Left and right arrow keys move between websites. Escape, Exit, or leaving full screen returns to settings.

Only the website on screen is loaded. When Loopframe advances, it closes that view, which releases the camera and the page’s timers, then loads the next address from scratch. A project therefore starts clean on every visit. Keeping every site open in the background would make a return visit instant, but it would also hold cameras, memory, and background work for the whole list. Loopframe does not do that.

Pages are expected to start their own interaction. Loopframe does not click a website’s Start button. It does allow media to play without a user gesture so an installation page can begin on its own.

A saved address may redirect while it is first opening, and that destination is shown. Camera access is not extended to a host that is not itself in the list. Later navigations have to stay on a saved origin, and new windows are blocked.

## Permission

Loopframe answers website permission requests itself. Camera and microphone are allowed only when their checkboxes are on, and only when the requesting frame’s origin is one of the saved website origins. A page that asks for both at once is refused unless both checkboxes are on, because Electron can only allow or deny that request as a whole. Geolocation, notifications, screen capture, and other permissions are denied.

This does not override the operating system. On macOS, the first Play asks for camera access if the system has not decided yet. After that, listed websites should not show their own camera popups. If macOS has denied access, Loopframe explains how to turn it on:

System Settings → Privacy & Security → Camera → enable Loopframe

Use **Retry camera access** after changing that switch, or **Play without camera** to run the loop anyway. If the system has denied the camera, websites that need it will fail on their own; Loopframe still advances.

In a development checkout the system prompt names **Electron**, not Loopframe, and the grant is stored for the Electron app. A packaged, signed Loopframe uses the bundle id `com.loopframe.app`. macOS remembers the camera choice for that signed identity. An ad-hoc signature can change between builds, so the prompt may return until the app is signed with a stable Developer ID.

Microphone permission, when you enable it, is the same kind of system switch under Privacy & Security → Microphone.

## Startup

The checkbox registers a login item. It does not start the computer, and it does not run before someone logs in.

- macOS and Windows use Electron’s login-item API. On macOS, a login launch is detected with `wasOpenedAtLogin`. On Windows, the login registration launches Loopframe with `--start-loop`.
- Linux writes or removes an XDG autostart entry for the packaged executable, also with `--start-loop`.
- Opening Loopframe yourself, from the Dock or the desktop, shows settings even when the checkbox is on.
- If macOS says the login item needs approval, allow Loopframe in System Settings → General → Login Items.
- A development checkout saves the checkbox but does not register the Electron shell to open at login. Package and install Loopframe before relying on that switch.

## Security

Website views run with `nodeIntegration` disabled, `contextIsolation` enabled, and the sandbox on. Web security stays on. Loopframe does not use fake camera devices or a switch that disables web security.

The settings and playback pages have small preload bridges. Remote sites do not get a preload. IPC handlers accept messages only from those local pages, and they check the shape of saved settings and playback commands.

## Packaging

```bash
npm run pack
npm run dist:mac
npm run dist:win
npm run dist:linux
```

`pack` builds an unpacked app in `release/`. The `dist:*` commands build installers. macOS builds use hardened runtime, `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, and camera plus microphone device entitlements so a signed app can request those devices. The microphone entitlement is present so the optional setting can work; the permission handler still denies the microphone until you enable it.

To make macOS camera approval stick, sign the app with a Developer ID. Unsigned local builds are useful for development, not for a gallery machine that must keep its permission.

## What the automated checks cover

`npm test` covers URL validation, settings round-trips, corrupt files, playlist wrap, permission decisions (including an unlisted frame, microphone default, and unrelated permissions), separate load and display clocks, pause, failed loads, and stale events after a view is replaced.

`npm run test:self` loads local pages inside Electron and checks that:

- settings survive a save through the real settings page
- the settings page does not receive Node.js
- an unlisted origin, a microphone request, and a redirect to another origin are denied by the live permission handlers
- a listed video request is allowed when doing so will not raise a new macOS prompt
- the display timer advances, a dropped connection and a stalled load show the error state, and views are closed when playback exits
- Escape leaves fullscreen when the window system enters it

The self-test, on a Mac where camera access was already granted, opened a camera stream for a listed origin and stopped those tracks before closing the view. It denied an unlisted origin, a microphone request, and a redirect to a different origin. It did not watch the hardware indicator, and it did not raise a first-run system prompt.

## What still needs a real machine

These are not proven by the automated checks:

- The camera indicator lighting while a listed site is open, and going out when Loopframe moves to the next site. The self-test stops any capture it starts, but it does not watch the hardware light.
- The macOS camera prompt, the System Settings path, and a grant that is still there after quitting. In development the prompt is for Electron. Persistence needs a packaged app signed with a stable identity.
- The packaged `NSCameraUsageDescription` text, because that string is written into the app at package time.
- Login-item registration in System Settings, the Windows startup list, or a Linux session. Development builds deliberately skip that registration.
- A website’s own camera error if macOS has denied Loopframe. The app cannot bypass that denial.
