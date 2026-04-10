import { Metadata } from 'next';
import { getAllBlogPosts } from '@/lib/blog';
import Link from 'next/link';
import { CalendarIcon, UserIcon, TagIcon, ArrowRightIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog - QueryPanel',
  description: 'Latest articles, tutorials, and updates about QueryPanel - Natural Language to SQL SDK',
  keywords: ['QueryPanel blog', 'natural language to SQL', 'analytics tutorials'],
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Blog - QueryPanel',
    description: 'Latest articles, tutorials, and updates about QueryPanel',
    type: 'website',
    images: [{ url: '/opengraph-image' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog - QueryPanel',
    description: 'Latest articles, tutorials, and updates about QueryPanel',
    images: ['/opengraph-image'],
  },
};

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <div className="container px-4 py-16 max-w-6xl mx-auto">
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 px-4 py-2 rounded-full border border-purple-200 dark:border-purple-800">
            <TagIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Blog</span>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
            Latest Articles
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tutorials, guides, and insights about building analytics with QueryPanel
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group"
            >
              <article className="h-full bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-purple-100 dark:border-purple-900/50 hover:border-purple-300 dark:hover:border-purple-700 transition-all hover:shadow-xl hover:shadow-purple-500/10">
                <div className="aspect-video bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                      <TagIcon className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <div className="absolute top-4 left-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-xs font-medium text-purple-700 dark:text-purple-300">
                      <CalendarIcon className="w-3.5 h-3.5" />
                      {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  <h2 className="text-xl font-bold text-foreground mb-3 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  
                  <p className="text-muted-foreground text-sm mb-4 line-clamp-3">
                    {post.description}
                  </p>
                  
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-xs font-medium text-purple-700 dark:text-purple-300"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-purple-100 dark:border-purple-900/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <UserIcon className="w-4 h-4" />
                      {post.authors.length ? post.authors.join(', ') : 'QueryPanel Team'}
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium text-purple-600 dark:text-purple-400 group-hover:translate-x-1 transition-transform">
                      Read more
                      <ArrowRightIcon className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
