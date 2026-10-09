import {
  Baby,
  BookMarked,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  ChefHat,
  Code,
  Dog,
  Dumbbell,
  Film,
  FolderKanban,
  Gamepad2,
  GraduationCap,
  GitPullRequest,
  Heart,
  House,
  Leaf,
  Lightbulb,
  ListChecks,
  Map as MapIcon,
  Music,
  Notebook,
  Palette,
  Pill,
  Plane,
  ShoppingCart,
  Sparkles,
  Star,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

// The icons a page may use: the same list as ICONS in bridge/app/spaces/schema.py (keep both in sync).
const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  'chef-hat': ChefHat,
  'book-open': BookOpen,
  dumbbell: Dumbbell,
  'folder-kanban': FolderKanban,
  users: Users,
  'git-pull-request': GitPullRequest,
  plane: Plane,
  film: Film,
  music: Music,
  heart: Heart,
  wallet: Wallet,
  leaf: Leaf,
  star: Star,
  map: MapIcon,
  camera: Camera,
  code: Code,
  home: House,
  gamepad: Gamepad2,
  briefcase: Briefcase,
  'list-checks': ListChecks,
  notebook: Notebook,
  pill: Pill,
  'shopping-cart': ShoppingCart,
  lightbulb: Lightbulb,
  trophy: Trophy,
  baby: Baby,
  dog: Dog,
  car: Car,
  palette: Palette,
}

export const ICON_NAMES = Object.keys(ICONS)

// The screen modules' icons (not offered to pages).
const SCREEN_ICONS: Record<string, LucideIcon> = { 'graduation-cap': GraduationCap, 'book-marked': BookMarked }

export function SpaceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? SCREEN_ICONS[name] ?? Sparkles
  return <Icon aria-hidden className={className} />
}
