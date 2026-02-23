class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 4096;
    this.downsampleRatio = Math.max(1, Math.round(sampleRate / 16000));
    this.sampleCounter = 0;
    this.filterState = 0;
  }

  lowPassFilter(sample) {
    const alpha = 0.5;
    this.filterState = alpha * sample + (1 - alpha) * this.filterState;
    return this.filterState;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channel = input[0];
    const length = channel.length;

    for (let i = 0; i < length; i++) {
      const filtered = this.lowPassFilter(channel[i]);

      this.sampleCounter++;

      if (this.sampleCounter >= this.downsampleRatio) {
        this.sampleCounter = 0;

        const sample = Math.max(-1, Math.min(1, filtered));
        const int16 = Math.round(sample * 32767);
        this.buffer.push(int16);

        if (this.buffer.length >= this.bufferSize) {
          const int16Array = new Int16Array(this.buffer);
          this.port.postMessage({ type: 'audio', data: int16Array });
          this.buffer = [];
        }
      }
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
