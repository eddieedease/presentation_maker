import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface Feature {
  title: string;
  body: string;
  icon: string;
}

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './landing.html',
})
export class Landing {
  private readonly auth = inject(AuthService);

  protected readonly isAuthenticated = this.auth.isAuthenticated;

  protected readonly features: Feature[] = [
    {
      icon: '🎛️',
      title: 'A familiar slide editor',
      body: 'Drag, drop and resize headings, text, images, code and shapes on a real canvas — no markdown required.',
    },
    {
      icon: '✨',
      title: 'Transitions and builds',
      body: 'Pick a transition per deck or per slide, and stagger elements with reveal.js fragments for step-by-step builds.',
    },
    {
      icon: '🎨',
      title: 'Twelve reveal.js themes',
      body: 'Switch the whole deck between night, dracula, solarized and more. Per-slide backgrounds override the theme.',
    },
    {
      icon: '🔗',
      title: 'Publish with a link',
      body: 'One click freezes a snapshot of your deck at a public URL. Share the link; revoke it whenever you want.',
    },
    {
      icon: '🔒',
      title: 'Accounts that stay yours',
      body: 'JSON Web Tokens with rotating refresh tokens, plus optional Google and GitHub sign-in over OAuth 2.0.',
    },
    {
      icon: '🗣️',
      title: 'Speaker notes built in',
      body: 'Write notes beside each slide and open the reveal.js speaker view with the S key while presenting.',
    },
  ];

  protected readonly steps = [
    { step: '01', title: 'Create a project', body: 'Start from a title slide and name your deck.' },
    { step: '02', title: 'Build your slides', body: 'Add elements, set transitions, reorder slides, preview live.' },
    { step: '03', title: 'Publish the link', body: 'Hand out the URL. Anyone with it can view the deck full screen.' },
  ];
}
