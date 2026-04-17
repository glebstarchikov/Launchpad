import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2, Send, Trash2 } from "lucide-react";
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

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isProcessing) {
    return (
      <Button size="sm" disabled className="h-8 gap-1.5">
        <Loader2 size={14} className="animate-spin" />
        Transcribing...
      </Button>
    );
  }

  if (preview) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <audio src={preview.url} controls className="h-8 max-w-[200px]" />
        <Button size="sm" variant="outline" onClick={discard} className="h-8 w-8 p-0" title="Discard">
          <Trash2 size={13} />
        </Button>
        <Button size="sm" onClick={submit} className="h-8 gap-1.5">
          <Send size={13} />
          Save idea
        </Button>
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
