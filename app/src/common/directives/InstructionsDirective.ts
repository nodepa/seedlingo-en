/**
 * Requires
 * - vuex, defaulting to an instructionsModeStore module storing an
 *   isInstructionsMode state
 * - directive being used on a vue component, not a HTML element
 *
 * Setup
 * import InstructionsDirective from './common/directives/InstructionsDirective';
 * app.use(InstructionsDirective, { Badge: MyBadge });
 *   where:
 *     - MyBadge is a Vue component overlaid the host element when in
 *       instructions-mode with the optional prop 'playing' indicating to
 *       animate or not
 *
 * Basic Usage
 * <v-btn v-instructions="./path/to/instructions.mp3" />
 */

import type { MutationPayload, Store } from 'vuex';
import type {
  App,
  Component,
  ComponentPublicInstance,
  DirectiveBinding,
  VNode,
} from 'vue';
import { h, ref, render } from 'vue';

export interface InstructionsElement extends HTMLElement {
  $instructions?: Instructions;
}

export interface InstructionsOptions {
  Badge: Component;
}

export interface InstructionsModeRootState {
  instructionsModeStore: InstructionsModeState;
}

export interface InstructionsModeState {
  isInstructionsMode: boolean;
}

export class Instructions {
  public static AudioCollection: Array<HTMLAudioElement> = [];

  private hostElement: InstructionsElement;

  private badgeVNode?: VNode;

  private audioElement: HTMLAudioElement;

  private vm: ComponentPublicInstance;

  private unsubscribeInstructionsModeWatch?: VoidFunction;

  private store: Store<InstructionsModeRootState>;

  private showAudioRipple = ref(false);

  constructor(
    hostElement: InstructionsElement,
    audioUrl: string,
    vm: ComponentPublicInstance,
    Badge: Component,
    store: Store<InstructionsModeRootState>,
  ) {
    this.hostElement = hostElement;
    this.audioElement = document.createElement('audio');
    this.vm = vm;
    this.badgeVNode = h(Badge, { playing: this.showAudioRipple });
    render(this.badgeVNode, document.createElement('div'));

    this.store = store;

    this.makeResponsiveToInstructionsModeChange();
    // In case already isInstructionsMode
    if (this.store.state.instructionsModeStore?.isInstructionsMode) {
      this.addEventListener();
      this.addStyling();
    }
    this.audioElement.src = audioUrl;
    this.addAudioListeners();
    this.hostElement.appendChild(this.audioElement);
    Instructions.AudioCollection.push(this.audioElement);
  } // end constructor

  public setAudioSrc(audioUrl: string): void {
    this.audioElement.src = audioUrl;
  }

  public addEventListener(): void {
    this.hostElement.addEventListener(
      'click',
      Instructions.playInstructionsClick,
      true,
    );
  }

  public removeEventListener(): void {
    this.hostElement.removeEventListener(
      'click',
      Instructions.playInstructionsClick,
      true,
    );
  }

  public addStyling(): void {
    this.hostElement.classList.add('pop-through');
    if (this.badgeVNode?.el) {
      if (
        this.hostElement.firstChild &&
        this.hostElement.firstChild !== this.badgeVNode.el
      ) {
        this.hostElement.insertBefore(
          this.badgeVNode.el as HTMLHtmlElement,
          this.hostElement.firstChild,
        );
      } else {
        this.hostElement.appendChild(this.badgeVNode.el as HTMLElement);
      }
    }
  }

  public removeStyling(): void {
    this.hostElement.classList.remove('pop-through');
    if (this.hostElement.firstElementChild === this.badgeVNode?.el) {
      this.hostElement.removeChild(this.badgeVNode.el as HTMLElement);
    }
  }

  public playInstructions(): void {
    this.audioElement.currentTime = 0;
    this.audioElement.play();
  }

  public unsubscribe(): void {
    if (this.unsubscribeInstructionsModeWatch) {
      this.unsubscribeInstructionsModeWatch();
    } else {
      throw new Error(
        'The v-instructions directive is trying to unsubscribe from watching the vuex state, but no unsubscribe function has been provided.',
      );
    }
  }

  public delist(): void {
    Instructions.AudioCollection.splice(
      Instructions.AudioCollection.indexOf(this.audioElement),
      1,
    );
  }

  public unmount(): void {
    if (this.badgeVNode) {
      render(null, this.badgeVNode.el as HTMLElement);
      this.badgeVNode = undefined;
    }
  }

  public addAudioListeners(): void {
    this.audioElement.addEventListener('playing', () => {
      this.showAudioRipple.value = true;
      Instructions.pauseRegisteredInstructionsAudio(this.audioElement);
    });

    this.audioElement.addEventListener('pause', () => {
      this.showAudioRipple.value = false;
    });

    this.audioElement.addEventListener('ended', () => {
      this.showAudioRipple.value = false;
      if (this.store.state.instructionsModeStore?.isInstructionsMode) {
        this.store.dispatch('instructionsModeStore/toggleInstructionsMode');
      }
    });
  }

  private makeResponsiveToInstructionsModeChange() {
    this.unsubscribeInstructionsModeWatch = this.store.subscribe(
      (mutation: MutationPayload, state) => {
        if (
          mutation.type === 'instructionsModeStore/TOGGLE_INSTRUCTIONS_MODE'
        ) {
          if (state.instructionsModeStore?.isInstructionsMode) {
            this.addEventListener();
            this.addStyling();
          } else {
            this.removeEventListener();
            this.removeStyling();
            // Cancel audio and animation if manually toggled while still playing
            Instructions.pauseRegisteredInstructionsAudio();
            this.showAudioRipple.value = false;
          }
        }
      },
    );
  }

  static playInstructionsClick(this: InstructionsElement, event: Event): void {
    // prevent triggering the button's regular action
    event.preventDefault();
    event.stopPropagation();
    // instead, play the attached instructions
    if (this && this.$instructions) {
      this.$instructions.playInstructions();
    } else {
      throw new Error('Element has no "$instructions" property');
    }
  }

  static pauseRegisteredInstructionsAudio(excluded?: HTMLAudioElement): void {
    Instructions.AudioCollection.forEach((audioElement) => {
      if (audioElement !== excluded && !audioElement.paused) {
        audioElement.pause();
      }
    });
  }
}

export default {
  install(app: App, { Badge }: InstructionsOptions): void {
    app.directive('instructions', {
      mounted(
        hostElement: InstructionsElement,
        { instance: vm, value: audioUrl }: DirectiveBinding,
      ) {
        if (vm) {
          hostElement.$instructions = new Instructions(
            hostElement,
            audioUrl,
            vm as ComponentPublicInstance,
            Badge,
            app.config.globalProperties.$store,
          );
        } else {
          throw new Error(
            'Expected VNode to have a .componentInstance, but found none. Only use the v-instructions directive on Vue components.',
          );
        }
      },

      beforeUpdate(
        hostElement: InstructionsElement,
        { value: audioUrl }: DirectiveBinding,
      ) {
        if (hostElement.$instructions) {
          hostElement.$instructions.setAudioSrc(audioUrl);
        }
      },

      // e.g. when moving from /home to /about, removed elements will be unbound
      unmounted(hostElement: InstructionsElement) {
        if (hostElement.$instructions) {
          hostElement.$instructions.unsubscribe();
          hostElement.$instructions.removeEventListener();
          hostElement.$instructions.delist();
          hostElement.$instructions.unmount();
        }
      },
    });
  },
};
