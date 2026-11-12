import AppKit
import Foundation

let board = NSPasteboard.general
let action = CommandLine.arguments.dropFirst().first ?? ""
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
if action == "snapshot" {
    let items = (board.pasteboardItems ?? []).map { item -> [String: String] in
        var formats: [String: String] = [:]
        for type in item.types {
            if let data = item.data(forType: type) { formats[type.rawValue] = data.base64EncodedString() }
        }
        return formats
    }
    let data = try JSONSerialization.data(withJSONObject: ["changeCount": board.changeCount, "items": items])
    FileHandle.standardOutput.write(data)
} else if action == "count" {
    print(board.changeCount)
} else if action == "restore" {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard let data = try JSONSerialization.jsonObject(with: input) as? [String: Any],
          let count = data["expectedCount"] as? Int,
          let items = data["items"] as? [[String: String]] else { fail("Invalid clipboard snapshot") }
    guard board.changeCount == count else { print("changed"); exit(0) }
    let copies = items.map { formats -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (name, value) in formats {
            if let data = Data(base64Encoded: value) { item.setData(data, forType: NSPasteboard.PasteboardType(name)) }
        }
        return item
    }
    board.clearContents()
    if !copies.isEmpty && !board.writeObjects(copies) { fail("Clipboard restoration failed") }
    print("restored")
} else { fail("Unknown clipboard action") }
