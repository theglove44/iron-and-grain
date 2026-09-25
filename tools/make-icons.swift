// Draws the app icon (crossed swords over wheat on a dark gold gradient) at each size iOS needs.
import AppKit
for size in [180, 192, 512] {
  let s = CGFloat(size)
  let img = NSImage(size: NSSize(width: s, height: s))
  img.lockFocus()
  let g = NSGradient(starting: NSColor(red: 0.30, green: 0.21, blue: 0.10, alpha: 1), ending: NSColor(red: 0.08, green: 0.06, blue: 0.04, alpha: 1))!
  g.draw(in: NSRect(x: 0, y: 0, width: s, height: s), relativeCenterPosition: NSPoint(x: 0, y: 0.35))
  let ring = NSBezierPath(ovalIn: NSRect(x: s*0.1, y: s*0.1, width: s*0.8, height: s*0.8))
  NSColor(red: 0.92, green: 0.71, blue: 0.30, alpha: 0.9).setStroke(); ring.lineWidth = s*0.03; ring.stroke()
  let para = NSMutableParagraphStyle(); para.alignment = .center
  let a: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: s*0.36), .paragraphStyle: para]
  ("🌾" as NSString).draw(in: NSRect(x: 0, y: s*0.14, width: s, height: s*0.5), withAttributes: a)
  ("⚔️" as NSString).draw(in: NSRect(x: 0, y: s*0.38, width: s, height: s*0.5), withAttributes: a)
  img.unlockFocus()
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  let out = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: out)
  rep.draw(in: NSRect(x: 0, y: 0, width: s, height: s)); NSGraphicsContext.restoreGraphicsState()
  try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "icon-\(size).png"))
}
