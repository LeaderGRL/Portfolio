# PENW runtime media

This directory contains runtime media that should remain as normal browser assets instead of being inlined into the generated content bundle.

## Arcade cabinet

Expected path:

```text
public/media/penw/arcade-cabinet.glb
```

The canonical cabinet model is the user-validated GLB used for the local Three.js viewer.

Expected properties:

- glTF binary version: 2
- file size: 284,128 bytes
- SHA-256: `01183a3004963847b815b4b43222a3e7617ee51763c8ab1b9e75265bf5fbbaa4`
- geometry count: 8 meshes

The model is intentionally loaded as a standard `.glb` through `GLTFLoader`. Do not replace it with project-specific geometry reconstruction code or bounding-box manifests.

The visible Three.js canvas stays detached from the DOM and is sampled by the shared document rasteriser, so the model passes through the same CRT framebuffer as local text and media.
