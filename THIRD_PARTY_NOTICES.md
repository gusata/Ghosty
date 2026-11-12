# Third-party notices

## Coucou launch greeting

The launch choreography and deterministic particle timing in `src/pet-motion.ts` and `src/launch-greeting.ts` are adapted from Coucou's Windows greeting renderer.

- Project: [Coucou](https://github.com/Louis-CFM/coucou)
- Source: [`windows/src/mochi/greeting.ts`](https://github.com/Louis-CFM/coucou/blob/main/windows/src/mochi/greeting.ts)
- Copyright: Copyright (c) 2026 Louis Raillé
- License: MIT. See the [full license text](https://raw.githubusercontent.com/Louis-CFM/coucou/main/LICENSE).

The Edge Ghosty adaptation uses its existing Ghosty character renderer. It does not include Coucou's Mochi artwork, sound, or other assets.

## Coucou for Windows — animation primitives

The `Spring`, `Tracked`, and cubic Bézier geometry animation in `src/anim.ts` is ported from `windows/src/core/anim.ts` in [Coucou](https://github.com/Louis-CFM/coucou), Copyright (c) Louis Raillé.

This code is distributed under the MIT License.

## Coucou for Windows — island host window techniques

`src-tauri/src/island_host.rs`, the host shrink in `src/main.ts` and the idle sleep of the frame loop in `src/pet-motion.ts` adapt techniques from Coucou's Windows port (`windows/src-tauri/src/island.rs`, `webview_memory.rs`, `lib.rs` and `windows/src/island/island.ts`), Copyright (c) Louis Raillé, MIT License (text below): a cursor poll that slows down far from the island and only reports near it, a host window that shrinks to the collapsed island, the WebView2 zoom correction for a devicePixelRatio that differs from the window scale, a low WebView2 memory target for hidden windows, and a frame loop that stops when nothing moves.

```text
MIT License

Copyright (c) 2026 Louis Raillé

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
