import { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { getStudents, askAssistant } from "../api/client";
import { useAuth } from "../context/AuthContext";

const seedMessages = [
  {
    role: "assistant",
    text: "Hi — ask me anything about your students: risk scores, milestones, meetings, or interventions. Try \"who's highest risk\", \"which students are low risk\", \"why is a student flagged\", or \"overdue milestones\".",
  },
];

export default function Assistant() {
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [messages, setMessages] = useState(seedMessages);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    getStudents(user.id).then(setStudents).catch(() => setStudents([]));
  }, [user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const send = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || !students || thinking) return;

    const userMsg = { role: "user", text: question };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setThinking(true);

    try {
      const { reply } = await askAssistant(user.id, question);
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      const errText = err?.response?.data?.error || "Something went wrong looking that up. Try again in a moment.";
      setMessages((prev) => [...prev, { role: "assistant", text: errText }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div
      className="max-w-2xl h-[70vh] rounded-xl flex flex-col overflow-hidden"
      style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
    >
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.role === "assistant" ? "self-start" : "self-end"
            }`}
            style={{
              background: m.role === "assistant" ? "var(--dl-teal-soft)" : "var(--dl-ink)",
              color: m.role === "assistant" ? "var(--dl-ink)" : "var(--dl-paper)",
              borderBottomLeftRadius: m.role === "assistant" ? 4 : undefined,
              borderBottomRightRadius: m.role === "user" ? 4 : undefined,
            }}
          >
            {m.text}
          </div>
        ))}
        {thinking && (
          <div
            className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl text-sm leading-relaxed self-start opacity-70"
            style={{ background: "var(--dl-teal-soft)", color: "var(--dl-ink)" }}
          >
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 p-3 border-t" style={{ borderColor: "var(--dl-line)" }}>
        <Sparkles size={16} style={{ color: "var(--dl-teal)" }} className="shrink-0" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={!students ? "Loading student data…" : thinking ? "Waiting for a reply…" : "Ask about your students…"}
          disabled={!students || thinking}
          className="flex-1 text-sm outline-none bg-transparent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!students || thinking}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 disabled:opacity-50"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
