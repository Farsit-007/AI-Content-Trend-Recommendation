## 1. Add the shadcnblocks navbar1 scaffold

- [x] 1.1 Run `npx shadcn add @shadcnblocks/navbar1` in `frontend/` and confirm it installs the block plus its primitives (`navigation-menu`, `sheet`, `accordion`) into `src/components/ui/`
- [x] 1.2 If the shadcnblocks registry fails, fall back to `npx shadcn add navigation-menu sheet accordion` and note it in the PR — _not needed; primary install succeeded. CLI wrote to a literal `@/` folder; files were relocated into `src/`, unused `navigation-menu`/`accordion` pruned (flat nav)._
- [x] 1.3 Verify `npm run build` still passes with the new primitives added

## 2. Navigation config

- [x] 2.1 Create a typed nav-items config (`{ label, to, icon?, roles? }[]`) covering Feed `/feed`, Generate `/generate`, Report `/report`, Chat `/chat`, and Admin `/admin` (Admin gated to `admin`/`super_admin`)
- [x] 2.2 Import icons from `lucide-react` for each item

## 3. Navbar component

- [x] 3.1 Copy the generated block to `src/components/shared/Navbar.tsx` and remove marketing pieces (mega-menu product grid, pricing/blog links, "Sign up" CTA)
- [x] 3.2 Replace the logo with the "Growth Studio" brand using `gradient-text`, linking to `/`
- [x] 3.3 Render primary links from the nav config using React Router `NavLink`, applying an active/highlight class via `cn()` on `isActive`
- [x] 3.4 Role-filter the links so Admin only shows for `admin`/`super_admin` (read `user.role` from `useAuth()`)
- [x] 3.5 Build the auth-aware account section: show `user.name` + `user.role`, and a Log out action calling `logout()`
- [x] 3.6 Re-skin the bar surface with `glass-card` and project tokens; ensure no leftover default shadcnblocks colors

## 4. Mobile menu

- [x] 4.1 Wire the mobile sheet/drawer to a local `open` state with a menu trigger below the `md` breakpoint
- [x] 4.2 Render the same role-filtered links and Log out action inside the mobile menu
- [x] 4.3 Close the mobile menu on navigation (link select) and on logout

## 5. App shell + routing

- [x] 5.1 Create `src/components/shared/AppLayout.tsx` rendering `<Navbar />` + `<main><Outlet /></main>`
- [x] 5.2 In `App.tsx`, nest `AppLayout` inside the existing `ProtectedRoute` element group and move `Home` under it
- [x] 5.3 Add placeholder routes/components for `/feed`, `/generate`, `/report`, `/chat`, `/admin` so nav targets resolve with visible titled content

## 7. Public / protected route split

- [x] 7.1 Create `PublicNavbar.tsx` (brand → `/`, Home/About links, auth-aware "Log in" / "Dashboard" CTA, no signup) and `PublicLayout.tsx`
- [x] 7.2 Add public pages `pages/Landing.tsx` (`/`) and `pages/About.tsx` (`/about`)
- [x] 7.3 Move the app shell + sections under protected `/dashboard/*`; app navbar brand and nav-items now target `/dashboard/*`
- [x] 7.4 Update `Login.tsx` so post-login and already-authenticated redirects go to `/dashboard`
- [x] 7.5 Re-run lint + build after the restructure

## 8. Theme toggle

- [x] 8.1 Add a class-based `ThemeProvider` + `useTheme` (persist to localStorage, default dark) and wrap the app in `main.tsx`
- [x] 8.2 Add `ThemeToggle` (Sun/Moon) button to both the app navbar and public navbar (desktop + mobile)
- [x] 8.3 Add an anti-flash inline script in `index.html`; make the Sonner toaster follow the active theme
- [x] 8.4 Re-run lint + build

## 6. Verify

- [x] 6.1 Run `npm run lint` and `npm run build` — both pass
- [ ] 6.2 Manually verify in dark mode: active highlighting works, Admin link hidden for `user` role, Log out returns to `/login` — _static/build verified; needs a live logged-in visual pass_
- [ ] 6.3 Verify responsive behavior at 375px — mobile menu opens, closes on navigation, no horizontal overflow — _static/build verified; needs a live visual pass_
