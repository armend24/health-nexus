import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Role } from '@/lib/rbacMatrix';
import { aiAssistantService } from '@/services/ai-assistant.service';
import { useAuthStore } from '@/stores/auth.store';
import { useMutation } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { Bot, MessageSquare, RotateCcw, Send, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

type MessageBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: string[] };

interface NavigationLink {
  label: string;
  href: string;
}

const ASSISTANT_SESSION_STORAGE_KEY =
  'health-nexus.ai-assistant.messages';

function getWelcomeMessage(role?: Role): ChatMessage {
  const contentByRole: Record<Role, string> = {
    CLIENT:
      'I am your Health Nexus AI Assistant. I can help with client tasks in the platform.\n\nTry:\n- How do I enroll in a tenant plan?\n- How do I book or reschedule an appointment?\n- Where can I see my appointments?',
    DOCTOR:
      'I am your Health Nexus AI Assistant. I can help with doctor workflows in the platform.\n\nTry:\n- Where can I see my appointments?\n- How do I manage my patient schedule?\n- What should I do after an appointment is booked?',
    TENANT_MANAGER:
      'I am your Health Nexus AI Assistant. I can help with tenant management tasks.\n\nTry:\n- How do I manage branding?\n- How do I manage doctors, services, or plans?\n- Where can I review enrollments?',
    SALES:
      'I am your Health Nexus AI Assistant. I can help with sales and onboarding workflows.\n\nTry:\n- How do tenant landing pages work?\n- How does onboarding work?\n- How do plans fit into the tenant flow?',
    SUPER_ADMIN:
      'I am your Health Nexus AI Assistant. I can help with platform administration tasks.\n\nTry:\n- How do I review tenants?\n- Where do I manage permissions or audit logs?\n- How do feature flags work?',
  };

  return {
    id: 'welcome',
    role: 'assistant',
    content:
      role && contentByRole[role]
        ? contentByRole[role]
        : 'I am your Health Nexus AI Assistant. I can help you navigate the platform and answer workflow questions.\n\nTry:\n- How do I sign in or register?\n- How do I find a tenant?\n- How do enrollment and appointment booking work?',
  };
}

function loadStoredMessages(
  welcomeMessage: ChatMessage
): ChatMessage[] {
  if (!globalThis.sessionStorage) {
    return [welcomeMessage];
  }

  try {
    const raw = globalThis.sessionStorage.getItem(
      ASSISTANT_SESSION_STORAGE_KEY
    );
    if (!raw) return [welcomeMessage];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [welcomeMessage];
    }

    const messages = parsed.filter(
      (item): item is ChatMessage =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'role' in item &&
        'content' in item &&
        typeof item.id === 'string' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string'
    );

    return messages.length > 0 ? messages : [welcomeMessage];
  } catch {
    return [welcomeMessage];
  }
}

function formatPageLabel(pathname: string): string {
  if (!pathname || pathname === '/') return 'Home';
  return pathname
    .split('/')
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/[-$]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    )
    .join(' / ');
}

function getWorkflowContext(pathname: string): string {
  if (pathname.startsWith('/appointments/book')) {
    return 'Appointment booking';
  }
  if (pathname.startsWith('/appointments/my')) {
    return 'Appointment management';
  }
  if (pathname.startsWith('/enrollment')) {
    return 'Client enrollment';
  }
  if (pathname.startsWith('/landing')) {
    return 'Tenant landing';
  }
  if (pathname.startsWith('/dashboard/tenant')) {
    return 'Tenant management';
  }
  if (pathname.startsWith('/dashboard/permissions')) {
    return 'Permissions and feature flags';
  }
  if (pathname.startsWith('/doctor/appointments')) {
    return 'Doctor appointments';
  }
  if (pathname.startsWith('/dashboard/client')) {
    return 'Client dashboard';
  }
  if (pathname.startsWith('/login')) {
    return 'Authentication';
  }
  if (
    pathname.startsWith('/register') ||
    pathname.startsWith('/signup')
  ) {
    return 'Client registration';
  }
  return 'General navigation';
}

function getNavigationLinks(pathname: string): NavigationLink[] {
  const commonLinks: NavigationLink[] = [
    { label: 'Home', href: '/' },
    { label: 'Tenants', href: '/tenants' },
    { label: 'Register', href: '/register' },
    { label: 'Login', href: '/login' },
  ];

  if (pathname.startsWith('/landing')) {
    return [
      ...commonLinks,
      { label: 'Enrollment', href: '/enrollment' },
      { label: 'Book appointment', href: '/appointments/book' },
    ];
  }

  if (pathname.startsWith('/appointments')) {
    return [
      ...commonLinks,
      { label: 'Book appointment', href: '/appointments/book' },
      { label: 'My appointments', href: '/appointments/my' },
      { label: 'Enrollment', href: '/enrollment' },
    ];
  }

  if (pathname.startsWith('/dashboard/tenant')) {
    return [
      { label: 'Dashboard', href: '/dashboard' },
      {
        label: 'Tenant settings',
        href: '/dashboard/tenant/settings',
      },
      { label: 'Tenant plans', href: '/dashboard/tenant/plans' },
      {
        label: 'Tenant enrollments',
        href: '/dashboard/tenant/enrollments',
      },
    ];
  }

  if (pathname.startsWith('/dashboard/client')) {
    return [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Client dashboard', href: '/dashboard/client' },
      { label: 'My appointments', href: '/appointments/my' },
      { label: 'Book appointment', href: '/appointments/book' },
    ];
  }

  if (pathname.startsWith('/dashboard/permissions')) {
    return [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Permissions', href: '/dashboard/permissions' },
      { label: 'Tenants', href: '/dashboard/tenants' },
    ];
  }

  if (pathname.startsWith('/doctor')) {
    return [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Doctor appointments', href: '/doctor/appointments' },
      { label: 'Profile', href: '/dashboard/profile' },
    ];
  }

  return [
    ...commonLinks,
    { label: 'Enrollment', href: '/enrollment' },
    { label: 'Book appointment', href: '/appointments/book' },
    { label: 'Dashboard', href: '/dashboard' },
  ];
}

function renderInlineFormatting(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (
      part.startsWith('**') &&
      part.endsWith('**') &&
      part.length > 4
    ) {
      return (
        <strong
          key={`${part}-${index}`}
          className="font-semibold text-foreground"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      part.startsWith('`') &&
      part.endsWith('`') &&
      part.length > 2
    ) {
      const codeText = part.slice(1, -1);

      if (codeText.startsWith('/')) {
        return (
          <a
            key={`${codeText}-${index}`}
            href={codeText}
            className="font-medium text-primary underline underline-offset-4"
          >
            {codeText}
          </a>
        );
      }

      return (
        <code
          key={`${codeText}-${index}`}
          className="rounded bg-muted px-1 py-0.5 text-[0.95em]"
        >
          {codeText}
        </code>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: MessageBlock[] = [];
  let currentList:
    | { type: 'bullet-list'; items: string[] }
    | { type: 'numbered-list'; items: string[] }
    | null = null;

  const flushCurrentList = () => {
    if (!currentList) return;
    blocks.push(currentList);
    currentList = null;
  };

  for (const line of lines) {
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);

    if (numberedMatch) {
      if (currentList?.type !== 'numbered-list') {
        flushCurrentList();
        currentList = { type: 'numbered-list', items: [] };
      }
      currentList.items.push(numberedMatch[1]);
      continue;
    }

    if (bulletMatch) {
      if (currentList?.type !== 'bullet-list') {
        flushCurrentList();
        currentList = { type: 'bullet-list', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    flushCurrentList();
    blocks.push({ type: 'paragraph', text: line });
  }

  flushCurrentList();
  return blocks;
}

function MessageContent({ content }: { content: string }) {
  const blocks = parseMessageBlocks(content);

  return (
    <div className="space-y-3 leading-6">
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return (
            <p
              key={`paragraph-${index}`}
              className="whitespace-pre-wrap"
            >
              {renderInlineFormatting(block.text)}
            </p>
          );
        }

        if (block.type === 'bullet-list') {
          return (
            <ul
              key={`bullet-list-${index}`}
              className="list-disc space-y-1 pl-5"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`bullet-item-${itemIndex}`}>
                  {renderInlineFormatting(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <ol
            key={`numbered-list-${index}`}
            className="list-decimal space-y-1 pl-5"
          >
            {block.items.map((item, itemIndex) => (
              <li key={`numbered-item-${itemIndex}`}>
                {renderInlineFormatting(item)}
              </li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

export function AIAssistantWidget() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const role = useAuthStore((s) => s.role);
  const welcomeMessage = useMemo(
    () => getWelcomeMessage(role),
    [role]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadStoredMessages(welcomeMessage)
  );

  const pageLabel = useMemo(
    () => formatPageLabel(pathname),
    [pathname]
  );
  const workflow = useMemo(
    () => getWorkflowContext(pathname),
    [pathname]
  );
  const navigationLinks = useMemo(
    () => getNavigationLinks(pathname),
    [pathname]
  );

  useEffect(() => {
    if (!globalThis.sessionStorage) return;

    try {
      globalThis.sessionStorage.setItem(
        ASSISTANT_SESSION_STORAGE_KEY,
        JSON.stringify(messages)
      );
    } catch {
      // Ignore storage failures so chat stays usable.
    }
  }, [messages]);

  useEffect(() => {
    setMessages((current) => {
      if (current.length === 1 && current[0]?.id === 'welcome') {
        return [welcomeMessage];
      }
      return current;
    });
  }, [welcomeMessage]);

  const chatMutation = useMutation({
    mutationFn: (content: string) =>
      aiAssistantService.chat({
        message: content,
        page: pageLabel,
        workflow,
        navigation_links: navigationLinks.map(
          ({ label, href }) => `${label}: ${href}`
        ),
      }),
    onSuccess: (data) => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer,
        },
      ]);
    },
    onError: () => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            "I couldn't reach the assistant right now. Try again in a moment.",
        },
      ]);
    },
  });

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed || chatMutation.isPending) return;

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      },
    ]);
    setMessage('');
    chatMutation.mutate(trimmed);
  };

  const handleClearChat = () => {
    setMessages([welcomeMessage]);
    setMessage('');
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-start gap-3">
      {isOpen ? (
        <Card className="w-[min(92vw,24rem)] border-border/70 bg-background/95 shadow-[0_24px_70px_rgba(15,23,42,0.32),0_10px_24px_rgba(15,23,42,0.2)] backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm">
                  Health Nexus AI
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Context: {pageLabel} · {workflow}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleClearChat}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsOpen(false)}
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {messages.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.role === 'user'
                      ? 'ml-8 rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground'
                      : 'mr-8 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-foreground'
                  }
                >
                  <MessageContent content={entry.content} />
                </div>
              ))}
              {chatMutation.isPending ? (
                <div className="mr-8 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
                  <span>Thinking</span>
                  <span className="ml-1 inline-flex">
                    <span className="animate-bounce [animation-delay:0ms]">
                      .
                    </span>
                    <span className="animate-bounce [animation-delay:150ms]">
                      .
                    </span>
                    <span className="animate-bounce [animation-delay:300ms]">
                      .
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask about this page"
                rows={2}
                className="min-h-16 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <Button
                size="icon"
                onClick={handleSubmit}
                disabled={!message.trim() || chatMutation.isPending}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Button
        size="lg"
        className="h-14 rounded-full px-5 shadow-[0_18px_40px_rgba(15,23,42,0.28),0_8px_18px_rgba(15,23,42,0.18)]"
        onClick={() => setIsOpen((open) => !open)}
      >
        <MessageSquare className="h-5 w-5" />
        AI Assistant
      </Button>
    </div>
  );
}
