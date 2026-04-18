import { useState, useRef, useCallback, useEffect, type MouseEvent } from "react";
import { Mic, Square, Loader2, Send, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onRecorded: (audioBlob: Blob) => void;
  isProcessing: boolean;
  disabled?: boolean;
}

export default function VoiceRecorder({ onRecorded, isProcessing, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !preview) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, [preview]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        setPreview({ blob, url: URL.createObjectURL(blob) });
      };

      recorder.start(1000);
      mediaRecorder.current = recorder;
      setIsRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    setIsRecording(false);
    clearInterval(timerRef.current);
  }, []);

  const submit = useCallback(() => {
    if (!preview) return;
    onRecordedRef.current(preview.blob);
    URL.revokeObjectURL(preview.url);
    setPreview(null);
  }, [preview]);

  const discard = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }, [preview]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isPlaying]);

  const handleSeek = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(pct * duration, duration));
  }, [duration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isProcessing) {
    return (
      <Button size="sm" disabled className="h-8 gap-1.5">
        <Loader2 size={14} className="animate-spin" />
        Saving...
      </Button>
    );
  }

  if (preview) {
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    return (
      <div className="rounded-md border border-border bg-card/50 px-3 py-2 w-full">
        <audio ref={audioRef} src={preview.url} preload="metadata" className="hidden" />
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatTime(Math.floor(currentTime))} / {formatTime(Math.floor(duration))}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full bg-secondary cursor-pointer mb-2"
          onClick={handleSeek}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={togglePlay} className="h-7 w-7 p-0">
            {isPlaying ? <Square size={10} className="fill-current" /> : <Play size={10} />}
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={discard}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Discard"
          >
            <Trash2 size={12} />
          </Button>
          <Button size="sm" onClick={submit} className="h-7 gap-1">
            <Send size={11} />
            Save idea
          </Button>
        </div>
      </div>
    );
  }

  if (isRecording) {
    return (
      <Button size="sm" variant="destructive" onClick={stopRecording} className="h-8 gap-1.5">
        <Square size={12} className="fill-current" />
        <span className="font-mono text-xs tabular-nums">{formatTime(elapsed)}</span>
        Stop
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={startRecording} disabled={disabled} className="h-8 gap-1.5">
      <Mic size={14} />
      Record
    </Button>
  );
}
