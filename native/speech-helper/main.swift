// HackDesk's on-device dictation helper: Apple SpeechAnalyzer behind a small NDJSON interface.
//
//   hackdesk-speech status                    → one `status` line
//   hackdesk-speech install --locale zh-TW    → `progress` lines, then `installed`
//   hackdesk-speech transcribe --locale zh-TW → `ready`, `level`, `volatile`, `final` …, then `done`
//       stdin: {"type":"stop"} (or end of input) finishes; {"type":"cancel"} quits without text.
//   hackdesk-speech transcribe-file --locale en-US --file sample.wav  (tests only)
//
// Audio stays in this process's memory: nothing is written to disk or sent over the network.

import AVFoundation
import Foundation
import Speech

/// One recording may run at most this long; the session then finishes as if stopped.
let maximumRecordingSeconds: Double = 5 * 60

// MARK: - Output

let outputQueue = DispatchQueue(label: "hackdesk.speech.output")

func emit(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
  outputQueue.sync {
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
  }
}

func fail(_ code: String, _ message: String) -> Never {
  emit(["type": "error", "code": code, "message": message])
  exit(1)
}

func argument(_ name: String) -> String? {
  let args = CommandLine.arguments
  guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
  return args[index + 1]
}

// MARK: - Locales

/// The first of the user's preferred languages that dictation supports, matching the region
/// when it can (zh-Hant-TW → zh-TW) and otherwise the language's main region (en-TW → en-US).
func suggestedLocale(_ supported: [Locale]) -> Locale? {
  func find(_ language: Locale.Language) -> Locale? {
    supported.first {
      $0.language.languageCode == language.languageCode && $0.language.region == language.region
    }
  }
  for preferred in Locale.preferredLanguages {
    let language = Locale.Language(identifier: preferred)
    if language.region != nil, let match = find(language) { return match }
    let main = Locale.Language(languageCode: language.languageCode, script: language.script, region: nil)
    if let match = find(Locale.Language(identifier: main.maximalIdentifier)) { return match }
  }
  return nil
}

func supportedLocale(_ identifier: String?) async -> Locale {
  let supported = await SpeechTranscriber.supportedLocales
  guard let identifier, !identifier.isEmpty else {
    if let match = suggestedLocale(supported) { return match }
    fail("locale-unsupported", "Dictation does not support your system language. Choose a language in Settings.")
  }
  guard let match = supported.first(where: { $0.identifier(.bcp47) == identifier }) else {
    fail("locale-unsupported", "Dictation does not support \(identifier).")
  }
  return match
}

func makeTranscriber(_ locale: Locale) -> SpeechTranscriber {
  SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
}

func isInstalled(_ locale: Locale) async -> Bool {
  let installed = await SpeechTranscriber.installedLocales
  return installed.contains { $0.identifier(.bcp47) == locale.identifier(.bcp47) }
}

// MARK: - Commands

func status() async {
  let supported = await SpeechTranscriber.supportedLocales
  let installed = await SpeechTranscriber.installedLocales
  emit([
    "type": "status",
    "available": SpeechTranscriber.isAvailable,
    "locales": supported.map { $0.identifier(.bcp47) }.sorted(),
    "installed": installed.map { $0.identifier(.bcp47) }.sorted(),
    "suggested": suggestedLocale(supported)?.identifier(.bcp47) ?? NSNull(),
  ])
}

func install(_ locale: Locale) async {
  let transcriber = makeTranscriber(locale)
  do {
    guard let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) else {
      emit(["type": "installed", "locale": locale.identifier(.bcp47)])
      return
    }
    let progress = request.progress
    let reporter = Task {
      var reported = -1.0
      while !Task.isCancelled {
        let fraction = (progress.fractionCompleted * 100).rounded() / 100
        if fraction != reported {
          reported = fraction
          emit(["type": "progress", "fraction": fraction])
        }
        try? await Task.sleep(for: .milliseconds(250))
      }
    }
    try await request.downloadAndInstall()
    reporter.cancel()
    emit(["type": "installed", "locale": locale.identifier(.bcp47)])
  } catch {
    fail("install-failed", "Could not download \(locale.identifier(.bcp47)): \(error.localizedDescription)")
  }
}

/// Passes results on as they come, keeping the finalized text for the closing `done`.
actor Transcript {
  private var finals: [String] = []

  func add(_ result: SpeechTranscriber.Result) {
    // Recognizers put a space before full-width punctuation ("你好 ，"); written Chinese has none.
    let text = String(result.text.characters)
      .replacingOccurrences(of: "\\s+(?=[，。！？、；：」』）])", with: "", options: .regularExpression)
    if result.isFinal {
      finals.append(text)
      emit(["type": "final", "text": text])
    } else {
      emit(["type": "volatile", "text": text])
    }
  }

  var text: String { finals.joined() }
}

func streamResults(of transcriber: SpeechTranscriber, into transcript: Transcript) -> Task<Void, Error> {
  Task {
    for try await result in transcriber.results {
      await transcript.add(result)
    }
  }
}

func requireInstalled(_ locale: Locale) async {
  guard await isInstalled(locale) else {
    fail("locale-not-installed", "Download \(locale.identifier(.bcp47)) for dictation in Settings first.")
  }
}

func transcribeFile(_ locale: Locale, path: String) async {
  await requireInstalled(locale)
  let transcriber = makeTranscriber(locale)
  let transcript = Transcript()
  do {
    let results = streamResults(of: transcriber, into: transcript)
    let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    if let last = try await analyzer.analyzeSequence(from: file) {
      try await analyzer.finalizeAndFinish(through: last)
    } else {
      await analyzer.cancelAndFinishNow()
    }
    try await results.value
    emit(["type": "done", "text": await transcript.text])
  } catch {
    fail("transcription-failed", error.localizedDescription)
  }
}

/// Converts microphone buffers to the analyzer's format and reports the input level.
final class MicrophoneFeed: @unchecked Sendable {
  private let engine = AVAudioEngine()
  private let continuation: AsyncStream<AnalyzerInput>.Continuation
  private let format: AVAudioFormat
  private var converter: AVAudioConverter?
  private var lastLevel = Date.distantPast

  init(format: AVAudioFormat, continuation: AsyncStream<AnalyzerInput>.Continuation) {
    self.format = format
    self.continuation = continuation
  }

  func start() throws {
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    converter = AVAudioConverter(from: inputFormat, to: format)
    input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
      self?.receive(buffer)
    }
    engine.prepare()
    try engine.start()
  }

  func stop() {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    continuation.finish()
  }

  private func receive(_ buffer: AVAudioPCMBuffer) {
    reportLevel(buffer)
    guard let converter else { return }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
    guard let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
    var consumed = false
    var error: NSError?
    converter.convert(to: converted, error: &error) { _, status in
      if consumed {
        status.pointee = .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    if error == nil, converted.frameLength > 0 {
      continuation.yield(AnalyzerInput(buffer: converted))
    }
  }

  /// Root-mean-square level of the latest buffer, at most 20 times a second, for the waveform.
  private func reportLevel(_ buffer: AVAudioPCMBuffer) {
    let now = Date()
    guard now.timeIntervalSince(lastLevel) >= 0.05, let samples = buffer.floatChannelData?[0] else { return }
    lastLevel = now
    let count = Int(buffer.frameLength)
    guard count > 0 else { return }
    var sum: Float = 0
    for index in 0..<count { sum += samples[index] * samples[index] }
    emit(["type": "level", "value": min(1, Double(sqrt(sum / Float(count))) * 8)])
  }
}

func requestMicrophone() async {
  switch AVCaptureDevice.authorizationStatus(for: .audio) {
  case .authorized:
    return
  case .notDetermined:
    if await AVCaptureDevice.requestAccess(for: .audio) { return }
  default:
    break
  }
  fail("microphone-denied", "HackDesk does not have microphone access. Allow it in System Settings › Privacy & Security › Microphone.")
}

/// Reads stop/cancel commands; end of input counts as stop, so a closed pipe never records forever.
func controlCommands() -> AsyncStream<String> {
  AsyncStream { continuation in
    Thread.detachNewThread {
      while let line = readLine() {
        guard let data = line.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = object["type"] as? String
        else { continue }
        continuation.yield(type)
        if type == "cancel" || type == "stop" { break }
      }
      continuation.yield("stop")
      continuation.finish()
    }
  }
}

func transcribeMicrophone(_ locale: Locale) async {
  await requireInstalled(locale)
  await requestMicrophone()
  let transcriber = makeTranscriber(locale)
  let transcript = Transcript()
  guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
    fail("audio-format", "No audio format is available for dictation.")
  }
  let (inputs, continuation) = AsyncStream<AnalyzerInput>.makeStream()
  let feed = MicrophoneFeed(format: format, continuation: continuation)
  let analyzer = SpeechAnalyzer(modules: [transcriber])
  do {
    let results = streamResults(of: transcriber, into: transcript)
    try await analyzer.start(inputSequence: inputs)
    try feed.start()
    emit(["type": "ready", "locale": locale.identifier(.bcp47)])

    let command = await withTaskGroup(of: String.self) { group in
      group.addTask {
        for await command in controlCommands() where command == "stop" || command == "cancel" { return command }
        return "stop"
      }
      group.addTask {
        try? await Task.sleep(for: .seconds(maximumRecordingSeconds))
        return "stop"
      }
      let first = await group.next() ?? "stop"
      group.cancelAll()
      return first
    }

    feed.stop()
    if command == "cancel" {
      await analyzer.cancelAndFinishNow()
      results.cancel()
      emit(["type": "cancelled"])
      return
    }
    try await analyzer.finalizeAndFinishThroughEndOfInput()
    try await results.value
    emit(["type": "done", "text": await transcript.text])
  } catch {
    feed.stop()
    fail("transcription-failed", error.localizedDescription)
  }
}

// MARK: - Entry

@main
struct SpeechHelper {
  static func main() async {
    let command = CommandLine.arguments.dropFirst().first ?? ""
    switch command {
    case "status":
      await status()
    case "install":
      await install(await supportedLocale(argument("--locale")))
    case "transcribe":
      await transcribeMicrophone(await supportedLocale(argument("--locale")))
    case "transcribe-file":
      guard let path = argument("--file") else { fail("usage", "transcribe-file needs --file.") }
      await transcribeFile(await supportedLocale(argument("--locale")), path: path)
    default:
      fail("usage", "Usage: hackdesk-speech status | install --locale ID | transcribe --locale ID")
    }
    exit(0)
  }
}
