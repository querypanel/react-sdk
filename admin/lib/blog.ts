import fs from 'fs';
import path from 'path';

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  authors: string[];
  tags: string[];
  keywords?: string[];
  image?: string;
  content: string;
}

export interface BlogPostMetadata {
  title: string;
  description: string;
  date: string;
  authors: string[];
  tags: string[];
  keywords?: string[];
  image?: string;
}

const BLOG_DIR = path.join(process.cwd(), 'data', 'blog');

export function getAllBlogPosts(): BlogPost[] {
  const files = fs.readdirSync(BLOG_DIR);
  const posts = files
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const filePath = path.join(BLOG_DIR, file);
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = parseMarkdown(fileContents);
      
      return {
        slug: file.replace(/\.md$/, ''),
        ...data,
        content
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return posts;
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  try {
    const filePath = path.join(BLOG_DIR, `${slug}.md`);
    const fileContents = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = parseMarkdown(fileContents);
    
    return {
      slug,
      ...data,
      content
    };
  } catch {
    return null;
  }
}

export function getAllBlogSlugs(): string[] {
  const files = fs.readdirSync(BLOG_DIR);
  return files.filter(file => file.endsWith('.md')).map(file => file.replace(/\.md$/, ''));
}

function parseMarkdown(content: string): { data: BlogPostMetadata; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    throw new Error('Invalid frontmatter format');
  }
  
  const [, frontmatter, body] = match;
  const data: Partial<BlogPostMetadata> & { author?: string } = {};
  
  frontmatter.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      
      if (key === 'tags' || key === 'authors' || key === 'keywords') {
        const tagMatch = value.match(/\[(.*?)\]/);
        if (tagMatch) {
          data[key] = tagMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')) as string[];
        } else {
          data[key] = [] as string[];
        }
      } else if (key === 'author') {
        data.author = value;
      } else if (key === 'title' || key === 'description' || key === 'date' || key === 'image') {
        data[key] = value;
      } else {
        return;
      }
    }
  });

  if (!data.authors?.length && data.author) {
    data.authors = [data.author];
  }
  
  return {
    data: {
      title: data.title ?? '',
      description: data.description ?? '',
      date: data.date ?? '',
      authors: data.authors ?? [],
      tags: data.tags ?? [],
      keywords: data.keywords,
      image: data.image,
    },
    content: body
  };
}
