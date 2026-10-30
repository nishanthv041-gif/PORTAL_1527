"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  MoreVertical, 
  Trash2, 
  RotateCw, 
  ChevronDown, 
  ShieldCheck, 
  User as UserIcon,
  Sparkles
} from "lucide-react";
import ChatMessageItem, { ChatMessage } from "./ChatMessageItem";
import ChatComposer from "./ChatComposer";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

interface ChatThreadClientProps {
  initialMessages: ChatMessage[];
  currentUserId: string;
  otherUserId: string;
  otherUser: {
    id: string;
    name: string;
    role: string;
    email?: string;
  };
  isAdmin?: boolean;
  backHref: string;
  channelBadge?: string;
}

export default function ChatThreadClient({
  initialMessages,
  currentUserId,
  otherUserId,
  otherUser,
  isAdmin = false,
  backHref,
  channelBadge,
}: ChatThreadClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const confirm = useConfirm();
  const [showMenu, setShowMenu] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const latestMessageDateRef = useRef<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Keep track of the latest message timestamp for incremental polling
  useEffect(() => {
    if (messages.length > 0) {
      const validDates = messages
        .filter((m) => m.status !== "sending" && m.status !== "failed")
        .map((m) => new Date(m.createdAt).getTime())
        .filter((t) => !isNaN(t));

      if (validDates.length > 0) {
        latestMessageDateRef.current = new Date(Math.max(...validDates)).toISOString();
      }
    }
  }, [messages]);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  // Scroll to bottom on initial mount
  useEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // Track scroll position to show/hide "Scroll to bottom" button
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollBottom(!isNearBottom);
  };

  // Real-Time Incremental Sync (Adaptive Polling with Concurrency Guard)
  const syncMessages = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const sinceParam = latestMessageDateRef.current
        ? `&since=${encodeURIComponent(latestMessageDateRef.current)}`
        : "";
      const res = await fetch(`/api/messages/thread?otherUserId=${otherUserId}${sinceParam}`, {
        cache: "no-store",
      });
      if (!res.ok) return;

      const data = await res.json();
      const newMessages: ChatMessage[] = data.messages || [];

      if (newMessages.length > 0) {
        setMessages((prev) => {
          const existingMap = new Map(prev.map((m) => [m.id, m]));
          let hasNewArrival = false;

          newMessages.forEach((nm) => {
            if (!existingMap.has(nm.id)) {
              existingMap.set(nm.id, nm);
              hasNewArrival = true;
            } else {
              // Update status or isRead if changed
              const existing = existingMap.get(nm.id);
              if (existing && (existing.isRead !== nm.isRead || existing.isDeleted !== nm.isDeleted)) {
                existingMap.set(nm.id, { ...existing, isRead: nm.isRead, isDeleted: nm.isDeleted });
              }
            }
          });

          if (!hasNewArrival) return prev;

          const updated = Array.from(existingMap.values()).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          // If user was near bottom, smoothly scroll to newest message
          if (scrollContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
            if (scrollHeight - scrollTop - clientHeight < 200) {
              setTimeout(() => scrollToBottom(true), 50);
            }
          }

          return updated;
        });
      }
    } catch (err) {
      console.warn("Message sync warning:", err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [otherUserId, scrollToBottom]);

  // Set up adaptive sync polling (active = 2s, idle > 25s = 5s, background = 8s)
  useEffect(() => {
    let currentDelay = 2000;
    let intervalId: NodeJS.Timeout;
    let lastUserActivity = Date.now();

    const startPolling = (delay: number) => {
      currentDelay = delay;
      clearInterval(intervalId);
      intervalId = setInterval(() => {
        // If tab is visible but user has been idle for > 25s, back off to 5s
        if (!document.hidden && Date.now() - lastUserActivity > 25000 && currentDelay < 5000) {
          startPolling(5000);
          return;
        }
        syncMessages();
      }, delay);
    };

    startPolling(2000);

    const onUserActive = () => {
      lastUserActivity = Date.now();
      if (currentDelay !== 2000 && !document.hidden) {
        syncMessages();
        startPolling(2000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startPolling(8000);
      } else {
        onUserActive();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", onUserActive);
    window.addEventListener("keydown", onUserActive, { passive: true });
    window.addEventListener("mousemove", onUserActive, { passive: true });
    window.addEventListener("touchstart", onUserActive, { passive: true });

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", onUserActive);
      window.removeEventListener("keydown", onUserActive);
      window.removeEventListener("mousemove", onUserActive);
      window.removeEventListener("touchstart", onUserActive);
    };
  }, [syncMessages]);

  // Manual Refresh
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setShowMenu(false);
    try {
      const res = await fetch(`/api/messages/thread?otherUserId=${otherUserId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTimeout(() => scrollToBottom(false), 50);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Optimistic Message Submission
  const handleSendMessage = async (payload: {
    content?: string;
    messageType: "TEXT" | "AUDIO" | "FILE" | "IMAGE";
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    duration?: number;
  }): Promise<boolean> => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const optimisticMsg: ChatMessage = {
      id: tempId,
      clientTempId: tempId,
      content: payload.content || (payload.messageType === "AUDIO" ? "🎤 Voice message" : payload.fileName || "Attachment"),
      senderId: currentUserId,
      receiverId: otherUserId,
      isRead: false,
      isDeleted: false,
      messageType: payload.messageType,
      fileUrl: payload.fileUrl,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      fileType: payload.fileType,
      duration: payload.duration,
      createdAt: new Date().toISOString(),
      status: "sending",
    };

    // 1. Instantly append to messages (Optimistic UI: 0ms lag!)
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 20);

    // 2. Dispatch to backend API asynchronously
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: otherUserId,
          content: payload.content,
          messageType: payload.messageType,
          fileUrl: payload.fileUrl,
          fileName: payload.fileName,
          fileSize: payload.fileSize,
          fileType: payload.fileType,
          duration: payload.duration,
          clientTempId: tempId,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to send message");
      }

      // 3. Replace temporary message with confirmed database record
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? { ...data.message, status: "sent" }
            : msg
        )
      );
      return true;
    } catch (err: unknown) {
      console.error("Message send failure:", err);
      // Update status to failed so user can retry
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: "failed" } : msg
        )
      );
      return false;
    }
  };

  // Retry Failed Message
  const handleRetryMessage = async (failedMsg: ChatMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === failedMsg.id ? { ...m, status: "sending" } : m))
    );

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: otherUserId,
          content: failedMsg.content,
          messageType: failedMsg.messageType,
          fileUrl: failedMsg.fileUrl,
          fileName: failedMsg.fileName,
          fileSize: failedMsg.fileSize,
          fileType: failedMsg.fileType,
          duration: failedMsg.duration,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error);

      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...data.message, status: "sent" } : m))
      );
    } catch (err) {
      console.error("Retry failed:", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...m, status: "failed" } : m))
      );
    }
  };

  // Delete message
  const handleDeleteMessage = async (id: string, mode: "for_me" | "for_everyone") => {
    // Optimistic delete
    setMessages((prev) => {
      if (mode === "for_everyone") {
        return prev.map((m) =>
          m.id === id ? { ...m, isDeleted: true, content: "This message was deleted" } : m
        );
      } else {
        return prev.filter((m) => m.id !== id);
      }
    });

    try {
      const res = await fetch(`/api/messages/${id}?mode=${mode}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete message on server");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete message. Please refresh.");
    }
  };

  // Confirm Clear Chat
  const handleConfirmClear = async () => {
    const res = await fetch("/api/messages/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherUserId }),
    });

    if (!res.ok) {
      throw new Error("Failed to clear chat");
    }

    // Immediately clear local messages
    setMessages([]);
  };

  // Format date headers for WhatsApp-style date grouping
  const formatDateHeader = (dateStr: Date | string) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (d.toDateString() === today.toDateString()) return "Today";
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 140px)",
      minHeight: "550px",
      borderRadius: "16px",
      backgroundColor: "var(--card-bg, #ffffff)",
      border: "1px solid var(--border-color, #e2e8f0)",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.04)",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* 1. WhatsApp-Style Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.25rem",
        backgroundColor: "var(--card-bg, #ffffff)",
        borderBottom: "1px solid var(--border-color, #e2e8f0)",
        zIndex: 10,
        gap: "1rem",
      }}>
        {/* Left: Back button + Avatar + User Details */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", minWidth: 0 }}>
          <Link
            href={backHref}
            style={{
              color: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.4rem",
              borderRadius: "8px",
              opacity: 0.8,
              transition: "background 0.15s ease",
            }}
            title="Back to conversations"
          >
            <ArrowLeft size={20} />
          </Link>

          {/* User Avatar */}
          <div style={{
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            backgroundColor: "var(--primary-bg, rgba(99, 102, 241, 0.12))",
            color: "var(--primary, #6366f1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "1.05rem",
            flexShrink: 0,
            border: "1px solid rgba(99, 102, 241, 0.2)",
          }}>
            {otherUser.name.charAt(0).toUpperCase()}
          </div>

          {/* Name & Online Status */}
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: 0,
              fontSize: "1.05rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {otherUser.name}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1px" }}>
              <span style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#10b981",
                display: "inline-block",
              }} />
              <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                {otherUser.role.charAt(0) + otherUser.role.slice(1).toLowerCase()} • Active
              </span>
            </div>
          </div>
        </div>

        {/* Right: Badges & Menu */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {channelBadge && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.3rem 0.65rem",
              borderRadius: "20px",
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              color: "#10b981",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}>
              <ShieldCheck size={14} />
              <span className="hidden sm:inline">{channelBadge}</span>
            </div>
          )}

          {/* Header Action Menu */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                color: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                opacity: 0.75,
              }}
              title="Conversation options"
            >
              <MoreVertical size={18} />
            </button>

            {showMenu && (
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                backgroundColor: "var(--card-bg, #ffffff)",
                color: "var(--foreground, #1e293b)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "10px",
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.15)",
                zIndex: 60,
                minWidth: "160px",
                overflow: "hidden",
                marginTop: "4px",
              }}>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.9rem",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    color: "inherit",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <RotateCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                  Refresh Chat
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setShowMenu(false);
                    const ok = await confirm({
                      title: `Clear Chat with ${otherUser.name}?`,
                      message: `Clearing this chat will remove all message history with ${otherUser.name} from your view. New messages will still appear normally.`,
                      confirmText: "Clear Chat",
                      cancelText: "Cancel",
                      variant: "danger"
                    });
                    if (!ok) return;
                    await handleConfirmClear();
                  }}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.9rem",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    color: "var(--danger, #ef4444)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    borderTop: "1px solid var(--border-color, #e2e8f0)",
                  }}
                >
                  <Trash2 size={14} /> Clear Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Messages Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          backgroundColor: "var(--background, #f8fafc)",
          backgroundImage: "radial-gradient(var(--border-color, #e2e8f0) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          scrollBehavior: "smooth",
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            textAlign: "center",
            padding: "2rem",
            opacity: 0.65,
          }}>
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "rgba(99, 102, 241, 0.1)",
              color: "var(--primary, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
            }}>
              <Sparkles size={26} />
            </div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
              No messages yet
            </h3>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.875rem", maxWidth: "300px" }}>
              Send a text message, voice note, or file attachment to start the conversation with {otherUser.name}.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = messages[index - 1];
            const showDateHeader =
              !prevMsg ||
              new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            return (
              <div key={msg.id || msg.clientTempId || index} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {showDateHeader && (
                  <div style={{
                    display: "flex",
                    justifyContent: "center",
                    margin: "0.75rem 0 0.25rem",
                  }}>
                    <span style={{
                      padding: "0.25rem 0.75rem",
                      borderRadius: "12px",
                      backgroundColor: "var(--card-bg, #ffffff)",
                      color: "var(--text-secondary, #64748b)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                      border: "1px solid var(--border-color, #e2e8f0)",
                    }}>
                      {formatDateHeader(msg.createdAt)}
                    </span>
                  </div>
                )}

                <ChatMessageItem
                  message={msg}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  onDelete={handleDeleteMessage}
                  onRetry={handleRetryMessage}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          style={{
            position: "absolute",
            bottom: "85px",
            right: "24px",
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            backgroundColor: "var(--card-bg, #ffffff)",
            color: "var(--foreground, #1e293b)",
            border: "1px solid var(--border-color, #e2e8f0)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 30,
            transition: "transform 0.15s ease",
          }}
          title="Scroll to latest messages"
        >
          <ChevronDown size={20} />
        </button>
      )}

      {/* 3. WhatsApp-Style Composer Footer */}
      <div style={{
        padding: "0.85rem 1rem",
        backgroundColor: "var(--card-bg, #ffffff)",
        borderTop: "1px solid var(--border-color, #e2e8f0)",
        zIndex: 20,
      }}>
        <ChatComposer onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}
