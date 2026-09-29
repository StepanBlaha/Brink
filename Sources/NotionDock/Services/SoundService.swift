import AppKit
import AVFoundation
import NotionKit

/// Soft check-off "tick": a 40 ms ~1.2 kHz sine blip with a fast decay, synthesized in memory
/// (no bundled assets). Falls back to the system "Tink" sound at low volume.
@MainActor
final class SoundService {
    static let shared = SoundService()

    private var throttle = TickThrottle(minInterval: 0.08)
    private var player: AVAudioPlayer?
    private var prepared = false

    func tick() {
        guard Settings.shared.soundsEnabled else { return }
        play()
    }

    /// Plays regardless of the setting (for the "Test" button); still throttled.
    func play() {
        guard throttle.allow(now: Date()) else { return }
        prepareIfNeeded()
        if let player {
            player.currentTime = 0
            player.play()
        } else if let sound = NSSound(named: "Tink") {
            sound.volume = 0.15
            sound.stop()
            sound.play()
        }
    }

    private func prepareIfNeeded() {
        guard !prepared else { return }
        prepared = true
        let p = try? AVAudioPlayer(data: Self.makeWAV())
        p?.volume = 0.5
        p?.prepareToPlay()
        player = p
    }

    /// 16-bit mono PCM WAV of the blip.
    static func makeWAV(sampleRate: Int = 44_100, duration: Double = 0.04, frequency: Double = 1200, amplitude: Double = 0.18) -> Data {
        let count = Int(Double(sampleRate) * duration)
        var pcm = Data(capacity: count * 2)
        for i in 0..<count {
            let t = Double(i) / Double(sampleRate)
            let attack = min(1, t / 0.002)
            let envelope = attack * exp(-t * 110)
            let sample = sin(2 * .pi * frequency * t) * envelope * amplitude
            var v = Int16(max(-1, min(1, sample)) * Double(Int16.max)).littleEndian
            withUnsafeBytes(of: &v) { pcm.append(contentsOf: $0) }
        }
        func le32(_ x: UInt32) -> Data { var v = x.littleEndian; return withUnsafeBytes(of: &v) { Data($0) } }
        func le16(_ x: UInt16) -> Data { var v = x.littleEndian; return withUnsafeBytes(of: &v) { Data($0) } }
        var wav = Data("RIFF".utf8)
        wav.append(le32(UInt32(36 + pcm.count)))
        wav.append(Data("WAVEfmt ".utf8))
        wav.append(le32(16)); wav.append(le16(1)); wav.append(le16(1))
        wav.append(le32(UInt32(sampleRate))); wav.append(le32(UInt32(sampleRate * 2)))
        wav.append(le16(2)); wav.append(le16(16))
        wav.append(Data("data".utf8)); wav.append(le32(UInt32(pcm.count)))
        wav.append(pcm)
        return wav
    }
}
