(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  const motion = () => !reduced.matches && !paused;
  const behavior = () => motion() ? 'smooth' : 'instant';
  const clamp = (number, low, high) => Math.max(low, Math.min(high, number));
  const heroConversation = $('.hero-conversation');
  const sizeHeroConversation = () => {
    heroConversation.style.setProperty('--reply-rise', `${$('.bubble-two', heroConversation).offsetHeight + 12}px`);
    heroConversation.style.setProperty('--update-rise', `${$('.bubble-three', heroConversation).offsetHeight + 12}px`);
  };
  const heroSizeObserver = new ResizeObserver(sizeHeroConversation);
  $$('.hero-bubble', heroConversation).forEach(bubble => heroSizeObserver.observe(bubble));
  sizeHeroConversation();
  const nav = $('#nav');
  const mobileMenu = $('#mobile-menu');
  const menuToggle = $('.menu-toggle');
  const sectionLinks = $$('[data-section-link]');
  const trackedSections = $$('.nav-links a').map(link => $(link.getAttribute('href')));
  function setMobileMenu(open) {
    nav.classList.toggle('mobile-open', open);
    mobileMenu.classList.toggle('open', open);
    mobileMenu.inert = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuToggle.addEventListener('click', () => setMobileMenu(!mobileMenu.classList.contains('open')));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMobileMenu(false);
  });

  document.body.classList.add('js-motion');
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); revealObserver.unobserve(entry.target); }
    });
  }, { threshold: .12 });
  $$('.reveal').forEach(element => revealObserver.observe(element));

  const stage = $('#features');
  const featureCopies = $$('.feature-copy');
  const featureVisuals = $$('.feature-visual');
  const featureButtons = $$('[data-feature]');
  let activeFeature = 0;
  function setFeature(index) {
    activeFeature = index;
    [featureCopies, featureVisuals].forEach(elements => elements.forEach((element, i) => {
      element.classList.toggle('active', i === index);
      element.inert = i !== index;
    }));
    featureButtons.forEach((button, i) => {
      button.classList.toggle('active', i === index);
      button.setAttribute('aria-pressed', String(i === index));
    });
  }
  function goToFeature(index) {
    setFeature(index);
    const top = stage.getBoundingClientRect().top + scrollY;
    const travel = Math.max(0, stage.offsetHeight - innerHeight);
    const offset = reduced.matches ? -80 : travel * (index + .15) / 4;
    window.scrollTo({ top: top + offset, behavior: behavior() });
  }
  featureButtons.forEach(button => button.addEventListener('click', () => goToFeature(Number(button.dataset.feature))));
  let ticking = false;
  function updateScroll() {
    nav.classList.toggle('scrolled', scrollY > innerHeight * .1);
    const currentSection = [...trackedSections].reverse().find(section => section.getBoundingClientRect().top <= 170);
    sectionLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${currentSection?.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const featureRect = stage.getBoundingClientRect();
    if (!reduced.matches && featureRect.top <= 1 && featureRect.bottom >= 0) {
      const progress = clamp(-featureRect.top / Math.max(1, stage.offsetHeight - innerHeight), 0, 1);
      const index = Math.min(3, Math.floor(progress * 4));
      if (index !== activeFeature) setFeature(index);
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateScroll); }
  }, { passive: true });
  window.addEventListener('resize', () => {
    updateScroll(); updateCarousel();
    if (innerWidth > 850) setMobileMenu(false);
  });
  updateScroll();

  const carousel = $('.channel-track');
  const previousChannel = $('[data-carousel="prev"]');
  const nextChannel = $('[data-carousel="next"]');
  function updateCarousel() {
    previousChannel.disabled = carousel.scrollLeft < 8;
    nextChannel.disabled = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 8;
  }
  $$('[data-carousel]').forEach(button => button.addEventListener('click', () => {
    const distance = $('.channel-card').getBoundingClientRect().width + parseFloat(getComputedStyle(carousel).gap);
    carousel.scrollBy({ left: distance * (button.dataset.carousel === 'next' ? 1 : -1), behavior: behavior() });
  }));
  carousel.addEventListener('scroll', updateCarousel, { passive: true });
  updateCarousel();

  const examples = [
    { description: 'A warm welcome and a few simple questions. Start with their goals, experience, and what fits their life.', messages: [
      ['incoming', 'Hey! I’m your coach’s AI companion. Ready to talk about your goals? 👋'],
      ['outgoing', 'Yes! I want to feel stronger and get into a routine.'],
      ['incoming', 'Love that. How many days a week can you make time to train?'],
      ['outgoing', 'Three days would work for me.'],
      ['incoming', 'A great place to start. Next, let’s talk about your experience and the equipment you have.']
    ]},
    { description: 'A full session, straight to their messages. Your exercises, sets, reps, and coaching cues in one easy-to-follow plan.', messages: [
      ['outgoing', 'Hey coach! What’s on my plan for Tuesday?'],
      ['incoming', 'Tuesday is leg day 💪 Here’s your session.'],
      ['incoming', { type: 'workout', title: 'Tuesday · Leg day', subtitle: '45–60 MIN · SAMPLE WORKOUT', warmup: 'Warm up: 5–10 minutes of easy movement and lighter practice sets.', exercises: [
        ['Squats', '4 sets × 10 reps'],
        ['Romanian deadlifts', '3 sets × 10 reps'],
        ['Reverse lunges', '3 sets × 10 reps per leg'],
        ['Leg curls', '3 sets × 12 reps'],
        ['Standing calf raises', '3 sets × 15 reps']
      ], note: 'Rest about 2 minutes between squat sets and 60–90 seconds between the other sets.' }],
      ['incoming', 'Use the weights your coach assigned. Send me a check-in afterward and let me know how it felt.'],
      ['outgoing', 'Got it. Leg day it is 🔥']
    ]},
    { description: 'A photo makes the conversation personal. Your AI asks about portions and helps clients understand what is on their plate.', messages: [
      ['outgoing', { type: 'photo', src: 'assets/demo-salad.webp', alt: 'A casual phone photo of grilled chicken salad with lettuce, cucumber, tomatoes, avocado, and dressing on the side.', caption: 'Here’s my lunch 🥗 How does it look?' }],
      ['incoming', 'Looks like grilled chicken, greens, tomatoes, cucumber, and avocado. How much chicken, avocado, and dressing did you use?'],
      ['outgoing', 'About 150 g of chicken, half an avocado, and a tablespoon of dressing.'],
      ['incoming', 'Thanks! You’ve got protein from the chicken, fiber from the vegetables, and fats from the avocado and dressing. A colorful mix 🙌'],
      ['incoming', 'Those portion details help me understand the meal better than a photo alone. How did you feel after eating it?']
    ]},
    { description: 'A gym photo becomes a clear explanation and a shortcut to a real exercise demonstration. Try the YouTube link in the chat.', messages: [
      ['outgoing', { type: 'photo', src: 'assets/demo-squat-rack.webp', alt: 'A black squat rack with a loaded barbell and a flat bench in front of a white brick wall.', caption: 'What is this equipment for? Can I use it for leg day?' }],
      ['incoming', 'That’s a squat rack with a barbell and a bench. The rack holds the bar for squats, which train your legs and glutes. The bench is used for exercises such as bench presses.'],
      ['incoming', 'For squats, clear the bench out of the way and have a trainer help you set the bar height and appropriate safety supports. Here’s a technique walkthrough 👇'],
      ['incoming', { type: 'video', href: 'https://www.youtube.com/watch?v=Uv_DKDl7EjA', title: 'The Official Squat Form Checklist', source: 'SQUAT UNIVERSITY · YOUTUBE', label: 'Watch the squat tutorial' }],
      ['outgoing', 'Perfect. I’ll watch it before I start 👍']
    ]},
    { description: 'Keep small wins in the conversation. Reflect on the week, spot what got in the way, and plan the next step.', messages: [
      ['incoming', 'Check-in time ✨ How did your week feel?'],
      ['outgoing', 'I made it to all three workouts!'],
      ['incoming', 'That’s a win worth celebrating 🔥 What helped you show up?'],
      ['outgoing', 'Putting them in my calendar really helped.'],
      ['incoming', 'Let’s keep that habit. Anything you’d like your coach to know before next week?']
    ]}
  ];
  const tabs = $$('[data-tab]');
  const demoThread = $('#demo-thread');
  let selectedTab = 0;
  let demoTimers = [];
  function addMessage(container, direction, text, animate = true, follow = true) {
    const element = document.createElement('div');
    element.className = `msg ${direction}${animate && motion() ? ' message-in' : ''}`;
    element.textContent = text;
    container.append(element);
    if (follow) container.scrollTo({ top: container.scrollHeight, behavior: animate ? behavior() : 'instant' });
    return element;
  }
  function demoText(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }
  function addDemoMessage(direction, content, animate) {
    if (typeof content === 'string') return addMessage(demoThread, direction, content, animate, false);
    const bubble = document.createElement('div');
    bubble.className = `msg ${direction} demo-${content.type}${animate && motion() ? ' message-in' : ''}`;
    if (content.type === 'photo') {
      const photo = document.createElement('img');
      photo.src = content.src; photo.alt = content.alt;
      photo.width = content.src.includes('salad') ? 900 : 678;
      photo.height = content.src.includes('salad') ? 900 : 746;
      photo.draggable = false; photo.decoding = 'async';
      bubble.append(photo, demoText('p', 'demo-photo-caption', content.caption));
    }
    if (content.type === 'workout') {
      bubble.append(demoText('span', 'demo-workout-meta', content.subtitle), demoText('h4', '', content.title), demoText('p', 'demo-workout-warmup', content.warmup));
      const list = document.createElement('ol');
      content.exercises.forEach(([name, reps]) => {
        const item = document.createElement('li');
        item.append(demoText('strong', '', name), demoText('span', '', reps));
        list.append(item);
      });
      bubble.append(list, demoText('p', 'demo-workout-note', content.note));
    }
    if (content.type === 'video') {
      const link = document.createElement('a');
      link.className = 'demo-video-link'; link.href = content.href;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${content.label} on YouTube (opens in a new tab)`);
      const play = demoText('span', 'demo-video-play', '▶'); play.setAttribute('aria-hidden', 'true');
      link.append(play, demoText('span', 'demo-video-source', content.source), demoText('strong', '', content.title));
      const action = demoText('span', 'demo-video-action', content.label);
      const arrow = demoText('span', '', '↗'); arrow.setAttribute('aria-hidden', 'true'); action.append(arrow);
      link.append(action); bubble.append(link);
    }
    demoThread.append(bubble);
  }
  // Keep the conversation where the visitor leaves it as new examples appear.
  // Touch devices use native scrolling; mouse users can grab the message thread.
  let dragState = null;
  demoThread.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('a,button,input')) return;
    dragState = { id: event.pointerId, y: event.clientY, top: demoThread.scrollTop };
    demoThread.setPointerCapture(event.pointerId);
    demoThread.classList.add('is-dragging');
    event.preventDefault();
    demoThread.focus({ preventScroll: true });
  });
  demoThread.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.id) return;
    demoThread.scrollTop = dragState.top + dragState.y - event.clientY;
  });
  function endDemoDrag(event) {
    if (!dragState || event.pointerId !== dragState.id) return;
    if (demoThread.hasPointerCapture(event.pointerId)) demoThread.releasePointerCapture(event.pointerId);
    dragState = null;
    demoThread.classList.remove('is-dragging');
  }
  demoThread.addEventListener('pointerup', endDemoDrag);
  demoThread.addEventListener('pointercancel', endDemoDrag);
  demoThread.addEventListener('lostpointercapture', () => { dragState = null; demoThread.classList.remove('is-dragging'); });
  demoThread.addEventListener('dragstart', event => event.preventDefault());
  function playDemo(index = selectedTab, animate = true) {
    demoTimers.forEach(clearTimeout); demoTimers = [];
    selectedTab = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      tab.classList.toggle('active', i === index);
    });
    $('#demo-preview').setAttribute('aria-labelledby', `demo-tab-${index}`);
    $('#demo-description').textContent = examples[index].description;
    demoThread.replaceChildren();
    demoThread.scrollTop = 0;
    examples[index].messages.forEach(([direction, text], i) => {
      if (animate && motion() && i) demoTimers.push(setTimeout(() => addDemoMessage(direction, text, true), i * 650));
      else addDemoMessage(direction, text, false);
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => playDemo(i));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); tabs[next].focus(); playDemo(next); }
    });
  });
  $('.replay-button').addEventListener('click', () => playDemo());
  playDemo(0, false);
  const demoObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) { playDemo(); demoObserver.disconnect(); }
  }, { threshold: .45 });
  demoObserver.observe($('.demo-panel'));
  $('.motion-toggle').addEventListener('click', event => {
    paused = !paused;
    document.body.classList.toggle('motion-paused', paused);
    event.currentTarget.setAttribute('aria-pressed', String(paused));
    event.currentTarget.setAttribute('aria-label', paused ? 'Play animations' : 'Pause animations');
    event.currentTarget.title = paused ? 'Play animations' : 'Pause animations';
    $('span', event.currentTarget).textContent = paused ? '▶' : 'Ⅱ';
    if (paused) playDemo(selectedTab, false);
  });
  reduced.addEventListener('change', () => { updateScroll(); playDemo(selectedTab, false); });

  $$('.faq-item h3 button').forEach(button => button.addEventListener('click', () => {
    const shouldOpen = button.getAttribute('aria-expanded') !== 'true';
    $$('.faq-item h3 button').forEach(other => {
      const open = other === button && shouldOpen;
      other.setAttribute('aria-expanded', String(open));
      other.closest('.faq-item').classList.toggle('open', open);
      const answer = $(`#${other.getAttribute('aria-controls')}`);
      answer.getAnimations().forEach(animation => animation.cancel());
      if (open) {
        answer.hidden = false;
        if (motion()) answer.animate([{ height: '0px', opacity: 0 }, { height: `${answer.scrollHeight}px`, opacity: 1 }], { duration: 350, easing: 'ease-out' });
      } else if (!answer.hidden && motion()) {
        const animation = answer.animate([{ height: `${answer.scrollHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 250, easing: 'ease-in' });
        animation.finished.then(() => { if (other.getAttribute('aria-expanded') === 'false') answer.hidden = true; }).catch(() => {});
      } else answer.hidden = true;
    });
  }));

  const earningsPrice = $('#earnings-price');
  const earningsClients = $('#earnings-clients');
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function updateEarnings(normalize = false) {
    const priceCents = Math.round(clamp(earningsPrice.valueAsNumber || 0, 0, 10000) * 100);
    const clients = Math.floor(clamp(earningsClients.valueAsNumber || 0, 0, 1000000));
    const grossCents = priceCents * clients;
    const creatorCents = Math.round(grossCents * .8);
    if (normalize) {
      earningsPrice.value = String(priceCents / 100);
      earningsClients.value = String(clients);
    }
    $('#earnings-gross').textContent = currency.format(grossCents / 100);
    $('#earnings-share').textContent = currency.format(creatorCents / 100);
    $('#earnings-platform').textContent = currency.format((grossCents - creatorCents) / 100);
  }
  [earningsPrice, earningsClients].forEach(input => {
    input.addEventListener('input', () => updateEarnings());
    input.addEventListener('change', () => updateEarnings(true));
    input.addEventListener('blur', () => updateEarnings(true));
  });
  updateEarnings();

  const dialog = $('#app-dialog');
  const dialogContent = $('#dialog-content');
  let replyTimer;
  const info = {
    signin: ['CREATOR ACCOUNTS', 'Your coaching home is coming.', 'Creator sign-up and sign-in are part of the next stage of CoachLine. For now, explore the client experience with a sample conversation.'],
    voice: ['ON THE ROADMAP', 'A familiar voice. More connection.', 'We’re exploring voice notes that reflect a creator’s own voice, with their permission. This preview does not generate or clone voices.'],
    dashboard: ['ON THE ROADMAP', 'Your coaching, in one place.', 'The planned creator dashboard will bring together your approved content, client conversations, and updates that need your attention. This homepage is the first look at that experience.'],
    privacy: ['PREVIEW PRIVACY', 'A little clarity.', 'This preview does not create accounts, take payments, upload photos, or send chat messages to an AI service. Information entered into the creator setup and chat previews stays in this browser tab’s memory and is cleared when the page reloads. We have not added analytics or advertising trackers. GitHub Pages hosts the site and may process technical request information under its own privacy statement.'],
    terms: ['ABOUT THIS PREVIEW', 'Explore what’s next.', 'CoachLine is in development. The conversations and visual examples on this website are scripted demonstrations, not live coaching or individual fitness or medical advice. No subscription is started and no payment is taken. Features and proposed pricing may change before launch.']
  };
  function openDialog(type) {
    clearTimeout(replyTimer);
    setMobileMenu(false);
    if (type === 'demo') {
      dialogContent.innerHTML = '<span class="eyebrow">INTERACTIVE PREVIEW</span><h2 id="dialog-title">Meet your AI companion.</h2><p>A little taste of the CoachLine experience. Pick a topic or type a message.</p><div class="modal-chat" role="log" aria-label="Sample chat" aria-live="polite"></div><div class="suggestions"><button data-prompt="Plan my week">Plan my week ↗</button><button data-prompt="Help with a meal">Help with a meal ↗</button><button data-prompt="Weekly check-in">Weekly check-in ↗</button></div><form class="chat-form"><input name="message" aria-label="Your message" placeholder="Try a message…" maxlength="400" autocomplete="off" required><button type="submit" aria-label="Send message">↑</button></form><p class="preview-footnote">Scripted preview. Live coaching is coming soon.</p>';
      addMessage($('.modal-chat'), 'incoming', 'Hey! I’m your coach’s AI companion 👋 In this preview, we can explore workouts, meals, or a weekly check-in. What’s on your mind?', false);
    } else if (type === 'creator') {
      dialogContent.innerHTML = '<span class="eyebrow">CREATOR SETUP PREVIEW</span><h2 id="dialog-title">Start with your coaching.</h2><p>Give your companion a name and a little direction. See how your coaching style could take shape.</p><form class="creator-form"><label>Your coaching name<input name="coach" placeholder="e.g. Coach Mathias" autocomplete="off" maxlength="60" required></label><label>Who do you coach?<input name="audience" placeholder="e.g. Beginners building strength" autocomplete="off" maxlength="120" required></label><label>Your coaching style<select name="style"><option>Encouraging and supportive</option><option>Direct and focused</option><option>Energetic and motivating</option></select></label><button class="pill black" type="submit">Preview your companion <span aria-hidden="true">↗</span></button></form><p class="preview-footnote">Preview only. No account is created or information saved. Live creator setup is coming.</p>';
    } else {
      const [label, title, copy] = info[type] || info.signin;
      dialogContent.replaceChildren();
      const eyebrow = document.createElement('span'); eyebrow.className = 'eyebrow'; eyebrow.textContent = label;
      const heading = document.createElement('h2'); heading.id = 'dialog-title'; heading.textContent = title;
      const paragraph = document.createElement('p'); paragraph.textContent = copy;
      const button = document.createElement('button'); button.className = 'pill black'; button.dataset.dialog = 'demo'; button.textContent = 'Try a conversation ↗';
      dialogContent.append(eyebrow, heading, paragraph, button);
    }
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    $('.dialog-close').focus({ preventScroll: true });
  }
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => clearTimeout(replyTimer));
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
  function sampleReply(text) {
    const message = text.toLowerCase();
    if (/meal|food|lunch|eat|calori|protein/.test(message)) return 'Let’s talk about your meal 🥗 What’s in it, and roughly how much? In the full experience, your coach’s guidance and the details you share would help shape the conversation.';
    if (/check|week.*went|progress|did.*workout/.test(message)) return 'Check-in time! What went well this week, and what felt difficult? A small win counts. In the planned experience, your coach would be able to review updates that need their attention.';
    if (/pain|injur|hurt/.test(message)) return 'This is only a scripted preview, so I can’t assess pain or an injury. Stop an activity that hurts and speak with a qualified professional about what’s appropriate for you.';
    if (/plan|week|workout|gym|train|strong/.test(message)) return 'Let’s start with your goal, how many days you can train, and the equipment you have 💪 The full experience will use your coach’s approved guidance to help you build a routine.';
    if (/hello|hey|hi\b/.test(message)) return 'Hey! Good to see you 👋 Want to explore planning a workout, talking through a meal, or checking in on your week?';
    return 'Thanks for sharing! This demo uses scripted replies, so it can’t respond to every question yet. Try “Plan my week,” “Help with a meal,” or “Weekly check-in” to explore the experience.';
  }
  function sendSample(text) {
    const value = text.trim().slice(0, 400);
    const chat = $('.modal-chat');
    if (!value || !chat) return;
    clearTimeout(replyTimer); $('.typing', chat)?.remove();
    addMessage(chat, 'outgoing', value);
    const input = $('.chat-form input'); input.value = '';
    const typing = addMessage(chat, 'incoming', '•••'); typing.classList.add('typing'); typing.setAttribute('aria-label', 'Preparing sample reply');
    replyTimer = setTimeout(() => {
      typing.remove();
      addMessage(chat, 'incoming', sampleReply(value));
    }, motion() ? 650 : 0);
  }
  dialogContent.addEventListener('submit', event => {
    if (event.target.matches('.chat-form')) { event.preventDefault(); sendSample($('.chat-form input').value); }
    if (event.target.matches('.creator-form')) {
      event.preventDefault();
      const form = event.target;
      const nameInput = form.elements.namedItem('coach');
      const audienceInput = form.elements.namedItem('audience');
      const name = nameInput.value.trim();
      const audience = audienceInput.value.trim();
      if (!name || !audience) {
        const empty = !name ? nameInput : audienceInput;
        empty.setCustomValidity('Please add a few words.');
        empty.reportValidity();
        empty.addEventListener('input', () => empty.setCustomValidity(''), { once: true });
        return;
      }
      const style = form.elements.namedItem('style').value;
      dialogContent.innerHTML = '<span class="eyebrow">YOUR COMPANION CONCEPT</span><h2 id="dialog-title">It starts with you.</h2><p>Your content and coaching approach would guide your AI. Here’s a first look at its profile.</p><div class="creator-summary"><span class="eyebrow">AI COMPANION PREVIEW</span><strong id="companion-name"></strong><p id="companion-audience"></p><p id="companion-style"></p></div><button class="pill black" data-dialog="demo">See a sample conversation <span aria-hidden="true">↗</span></button><p class="preview-footnote">This is a local preview. Your companion has not been created, trained, or connected to messaging.</p>';
      $('#companion-name').textContent = `${name}’s AI`;
      $('#companion-audience').textContent = `For ${audience.charAt(0).toLowerCase() + audience.slice(1)}`;
      $('#companion-style').textContent = `Coaching style: ${style.toLowerCase()}.`;
      dialog.scrollTop = 0;
      $('#dialog-title').tabIndex = -1;
      $('#dialog-title').focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('button,a');
    if (!target) return;
    if (target.dataset.dialog) { event.preventDefault(); openDialog(target.dataset.dialog); }
    if (target.dataset.prompt) sendSample(target.dataset.prompt);
    if (target.dataset.demoTab !== undefined) {
      setMobileMenu(false); playDemo(Number(target.dataset.demoTab));
      $('#demo').scrollIntoView({ behavior: behavior(), block: 'start' });
    }
    if (target.matches('a[href^="#"]')) { setMobileMenu(false); }
    if (target.dataset.featureLink !== undefined) { event.preventDefault(); goToFeature(Number(target.dataset.featureLink)); }
  });
  $('#year').textContent = String(new Date().getFullYear());
})();
