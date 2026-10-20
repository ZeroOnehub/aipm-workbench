// AIPM 工坊: fit any square artwork onto the macOS icon grid.
// usage: swift aipm-icon.swift <input image> <output 1024px png> [--no-mask]
//
// The artwork is scaled into the 824 × 824 content square of a 1024 × 1024
// canvas and clipped to a rounded rectangle, so a full-bleed image from an
// image model lines up with other Dock icons. `--no-mask` keeps the artwork's
// own shape (use it when the image already has a transparent squircle).
import AppKit

let args = CommandLine.arguments
guard args.count >= 3, let source = NSImage(contentsOfFile: args[1]) else {
  FileHandle.standardError.write("usage: swift aipm-icon.swift <input> <output.png> [--no-mask]\n".data(using: .utf8)!)
  exit(2)
}
let mask = !args.contains("--no-mask")
let canvas: CGFloat = 1024
let content: CGFloat = mask ? 824 : 1024
let origin = (canvas - content) / 2
let rect = NSRect(x: origin, y: origin, width: content, height: content)

guard let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { exit(1) }
rep.size = NSSize(width: canvas, height: canvas)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
if mask {
  NSBezierPath(roundedRect: rect, xRadius: content * 0.225, yRadius: content * 0.225).addClip()
}
source.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: args[2]))
print("wrote \(args[2])")
