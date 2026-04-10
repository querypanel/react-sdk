import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { getBlogPostBySlug, getAllBlogSlugs } from '@/lib/blog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CalendarIcon, UserIcon, TagIcon, ArrowLeftIcon, ClockIcon } from 'lucide-react';
import Link from 'next/link';
import 'highlight.js/styles/github.css';
import { MermaidDiagram } from '@/components/blog/MermaidDiagram';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllBlogSlugs();
  return slugs.map((slug) => ({
    slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  
  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://querypanel.com';
  
  const description = post.description || "QueryPanel blog article";
  const ogImage = `${baseUrl}${post.image ?? '/opengraph-image'}`;
  const postUrl = `${baseUrl}/blog/${slug}`;
  const allKeywords = [
    ...post.tags,
    ...(post.keywords || []),
    'QueryPanel',
    'natural language to SQL',
    'text to SQL',
    'SQL generation',
  ];

  return {
    title: `${post.title} | QueryPanel Blog`,
    description,
    keywords: allKeywords,
    authors: post.authors.map((author) => ({ name: author })),
    alternates: {
      canonical: postUrl,
    },
    openGraph: {
      url: postUrl,
      title: post.title,
      description,
      type: 'article',
      publishedTime: post.date,
      modifiedTime: post.date,
      authors: post.authors,
      tags: post.tags,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
      siteName: 'QueryPanel',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: [ogImage],
      creator: '@querypanel',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const readingTime = Math.ceil(post.content.split(/\s+/).length / 200);
  const authorsLabel = post.authors.length ? post.authors.join(', ') : 'QueryPanel Team';
  
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://querypanel.com';
  const postUrl = `${baseUrl}/blog/${slug}`;
  
  // JSON-LD structured data for SEO and AI discovery
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    image: `${baseUrl}${post.image ?? '/opengraph-image'}`,
    datePublished: post.date,
    dateModified: post.date,
    author: post.authors.map((author) => ({
      '@type': 'Person',
      name: author,
    })),
    publisher: {
      '@type': 'Organization',
      name: 'QueryPanel',
      url: baseUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/favicon.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl,
    },
    keywords: [...post.tags, ...(post.keywords || [])].join(', '),
    about: {
      '@type': 'Thing',
      name: 'QueryPanel',
      description: 'Natural language to SQL SDK for multi-tenant SaaS applications',
    },
    inLanguage: 'en-US',
    articleSection: 'Technology',
  };

  return (
    <>
      <Script
        id={`json-ld-${slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
        <article className="container px-4 py-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>

        <header className="mb-12">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 px-4 py-2 rounded-full border border-purple-200 dark:border-purple-800">
              <TagIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Article</span>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            {post.title}
          </h1>

          <p className="text-xl text-muted-foreground mb-8 leading-relaxed" itemProp="description">
            {post.description}
          </p>

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground mb-8">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4" />
              <span className="font-medium">{authorsLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </time>
            </div>
            <div className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4" />
              <span>{readingTime} min read</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-sm font-medium text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
              >
                <TagIcon className="w-3.5 h-3.5" />
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-purple-100 dark:border-purple-900/50 shadow-xl shadow-purple-500/5 p-8 md:p-12">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold mt-12 mb-4 text-foreground">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-2xl font-bold mt-10 mb-4 text-foreground">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xl font-bold mt-8 mb-3 text-foreground">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-base leading-7 text-muted-foreground mb-6">
                    {children}
                  </p>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                  >
                    {children}
                  </a>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className?.includes('language-');
                  return isInline ? (
                    <code className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>{children}</code>
                  );
                },
                pre: ({ children }) => {
                  // Check if this is a mermaid diagram
                  const child = children as React.ReactElement<{ className?: string; children?: string | string[] }>;
                  if (child?.props?.className?.includes('language-mermaid')) {
                    const codeContent = typeof child.props.children === 'string' 
                      ? child.props.children 
                      : Array.isArray(child.props.children)
                      ? child.props.children.join('')
                      : '';
                    return <MermaidDiagram>{codeContent}</MermaidDiagram>;
                  }
                  
                  return (
                    <pre className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto border border-gray-200 dark:border-gray-700 mb-6">
                      {children}
                    </pre>
                  );
                },
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-6 space-y-2 text-muted-foreground">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside mb-6 space-y-2 text-muted-foreground">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="pl-2">{children}</li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-purple-500 pl-4 italic text-muted-foreground mb-6">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>
        </div>

        <footer className="mt-12 pt-8 border-t border-purple-200 dark:border-purple-800">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Written by <span className="font-medium text-foreground">{authorsLabel}</span>
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back to All Posts
            </Link>
          </div>
        </footer>
      </article>
      </div>
    </>
  );
}
