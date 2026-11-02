import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 5,
      let width = Int(CommandLine.arguments[3]),
      let height = Int(CommandLine.arguments[4]),
      width > 0, height > 0 else {
    fatalError("Usage: crop-png input.png output.png width height")
}
let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let original = CGImageSourceCreateImageAtIndex(source, 0, nil),
      width <= original.width, height <= original.height,
      let cropped = original.cropping(to: CGRect(x: 0, y: 0, width: width, height: height)),
      let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fatalError("Could not read or crop the rendered proposal screen")
}
CGImageDestinationAddImage(destination, cropped, nil)
guard CGImageDestinationFinalize(destination) else {
    fatalError("Could not save the proposal PNG")
}
