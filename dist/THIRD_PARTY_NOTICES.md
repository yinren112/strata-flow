# Third-party notices

## Three.js r140

This game bundles the Three.js r140 UMD build in `vendor/three.r140.min.js`.
Runtime reports `THREE.REVISION === "140"`. This is a fixed version, not a claim
that the latest Three.js release is in use.

Official source: https://github.com/mrdoob/three.js/tree/r140
Official license: https://github.com/mrdoob/three.js/blob/r140/LICENSE

The offline copy available in the development environment was extracted from
`trimesh/resources/templates/viewer.zip`, `viewer.html.template`. Only the Three.js
UMD core was retained; the surrounding viewer, TrackballControls and loader scripts
were not included. This provenance is recorded so dependency upgrades are explicit.

The complete MIT license is reproduced in `vendor/LICENSE.three.txt`, in the static
build, and inside the self-contained HTML file. Preserve it when redistributing.

## Project-created content

The game's rules, seeded levels, UI, cabinet geometry, CPU fallback renderer,
procedural icon and synthesized sound effects are implemented in the delivered
project sources. No external 3D model, stock image, music file or font file is
included. Fonts are selected from the user's system; no font files are distributed.

The project does not choose a public open-source license for the client's own code.
The `private` / `UNLICENSED` package metadata is intentional, not a restriction on
using the bundled Three.js under its MIT license. Decide the project's publication
and licensing terms before a public release. No trademark clearance or legal
review is represented by this delivery.

## Complete Three.js license

The MIT License

Copyright © 2010-2022 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
