class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channelData = input[0];
      const int16Data = new Int16Array(channelData.length);

      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.port.postMessage(int16Data.buffer, [int16Data.buffer]);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
