export interface Post {
  id: string;
  user: {
    name: string;
    avatar?: string;
  };
  content: string;
  image?: string;
  likes: number;
  comments: number;
  timestamp: string;
}

export const mockFeed: Post[] = [
  {
    id: '1',
    user: { name: 'Alice Johnson', avatar: 'https://i.pravatar.cc/100?img=1' },
    content: 'Just launched my new project! 🚀 So excited to share with the Circle community.',
    image: 'https://picsum.photos/seed/1/400/300',
    likes: 24,
    comments: 8,
    timestamp: '2 hours ago',
  },
  {
    id: '2',
    user: { name: 'Bob Smith', avatar: 'https://i.pravatar.cc/100?img=2' },
    content: 'Had a great hike today. Nature is the best therapy 🌿',
    image: 'https://picsum.photos/seed/2/400/300',
    likes: 42,
    comments: 12,
    timestamp: '5 hours ago',
  },
  {
    id: '3',
    user: { name: 'Carol White', avatar: 'https://i.pravatar.cc/100?img=3' },
    content: 'Just finished reading "Atomic Habits". Highly recommend! 📚',
    likes: 18,
    comments: 5,
    timestamp: '8 hours ago',
  },
];