# Loopframe

## What this is

Loopframe is a desktop app for exhibitions and installations. It plays a list of websites in full screen, one after another, including sites that use the camera.

## Why

A gallery browser asks for permission, shows its own interface, and needs someone nearby when a page fails. Loopframe keeps the list, shows each site for a set number of seconds, and grants the camera or microphone only to the addresses you saved.

## How to use

Install [Node.js](https://nodejs.org/) 20 or newer, then:

```bash
npm install
npm run dev
```

Add each website with **+**. Type how many seconds to show it. The clock starts when the page finishes loading. Reorder a row with the up and down buttons, or remove it with **×**.

**Play** saves the list and opens the loop. Move the pointer to show Previous, Pause, Next, and Exit. The controls hide again after a short pause. The left and right arrow keys change sites. Escape, Exit, or leaving full screen returns to settings.

Under **Permission**, **Camera** is on for the websites in the list. **Microphone** stays off until you turn it on. On a Mac, the first Play asks the system for access. If macOS has denied it, turn Loopframe on in System Settings → Privacy & Security → Camera, then use **Retry access**. **Play without camera** runs the loop anyway.

**Start loop when computer starts** opens Loopframe when you log in to this account, then begins playback. Opening the app yourself still shows settings. That switch takes effect after Loopframe is installed:

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```
