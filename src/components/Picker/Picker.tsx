import gsap from "gsap";
import React from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Draggable } from "gsap/Draggable";

gsap.registerPlugin(ScrollTrigger, Draggable);
export type PickerProps = {};

class DragScroll {
  iteration = 0; // gets iterated when we scroll all the way to the end or start and wraps around - allows us to smoothly continue the playhead scrubbing in the correct direction.
  scrub;
  constructor(seamlessLoop: gsap.core.Timeline) {
    const playhead = { offset: 0 }; // a proxy object we use to simulate the playhead position, but it can go infinitely in either direction and we'll just use an onUpdate to convert it to the corresponding time on the seamlessLoop timeline.
    const wrapTime = gsap.utils.wrap(0, seamlessLoop.duration()); // feed in any offset (time) and it'll return the corresponding wrapped time (a safe value between 0 and the seamlessLoop's duration)
    this.scrub = gsap.to(playhead, {
      // we reuse this tween to smoothly scrub the playhead on the seamlessLoop
      offset: 0,
      onUpdate() {
        seamlessLoop.time(wrapTime(playhead.offset)); // convert the offset to a "safe" corresponding time on the seamlessLoop timeline
      },
      duration: 0.5,
      ease: "power3",
      paused: true,
    });
  }

  draggable() {
    const { scrub } = this;
    // below is the dragging functionality (mobile-friendly too)...
    Draggable.create(".drag-proxy", {
      type: "x",
      trigger: ".cards",
      onPress() {
        this.startOffset = scrub.vars.offset;
      },
      onDrag() {
        scrub.vars.offset = this.startOffset + (this.startX - this.x) * 0.001;
        scrub.invalidate().restart(); // same thing as we do in the ScrollTrigger's onUpdate
      },
      onDragEnd() {
        // scrollToOffset(scrub.vars.offset);
      },
    });
  }
}

// This function will get called for each element in the buildSeamlessLoop() function, and we just need to return an animation that'll get inserted into a master timeline, spaced
function animateFunc(element: any) {
  const tl = gsap.timeline();
  tl.fromTo(
    element,
    { scale: 0, opacity: 0 },
    {
      scale: 1,
      opacity: 1,
      zIndex: 100,
      duration: 0.5,
      yoyo: true,
      repeat: 1,
      ease: "power1.in",
      immediateRender: false,
    }
  ).fromTo(
    element,
    { xPercent: 400 },
    { xPercent: -400, duration: 1, ease: "none", immediateRender: false },
    0
  );
  return tl;
}

export default function Picker({}: PickerProps) {
  React.useEffect(() => {
    const individualCards = ".cards li";

    // set initial state of items
    gsap.set(individualCards, { xPercent: 400, opacity: 0, scale: 0 });

    const spacing = 0.1; // spacing of the cards (stagger)
    const snapTime = gsap.utils.snap(spacing); // we'll use this to snapTime the playhead on the seamlessLoop
    const cards = gsap.utils.toArray(individualCards);
    const seamlessLoop = buildSeamlessLoop(cards, spacing, animateFunc);
    const scrubber = new DragScroll(seamlessLoop);
    const scrub = scrubber.scrub;

    const trigger = ScrollTrigger.create({
        start: 0,
        onUpdate(self) {
          let scroll = self.scroll();
          if (scroll > self.end - 1) {
            wrap(1, 1);
          } else if (scroll < 1 && self.direction < 0) {
            wrap(-1, self.end - 1);
          } else {
            scrub.vars.offset =
              (scrubber.iteration + self.progress) * seamlessLoop.duration();
            scrub.invalidate().restart(); // to improve performance, we just invalidate and restart the same tween. No need for overwrites or creating a new tween on each update.
          }
        },
        end: "+=3000",
        pin: ".gallery",
      }),
      // converts a progress value (0-1, but could go outside those bounds when wrapping) into a "safe" scroll value that's at least 1 away from the start or end because we reserve those for sensing when the user scrolls ALL the way up or down, to wrap.
      progressToScroll = (progress) =>
        gsap.utils.clamp(
          1,
          trigger.end - 1,
          gsap.utils.wrap(0, 1, progress) * trigger.end
        );
    function wrap(iterationDelta: number, scrollTo: number) {
      scrubber.iteration += iterationDelta;
      trigger.scroll(scrollTo);
      trigger.update(); // by default, when we trigger.scroll(), it waits 1 tick to update().
    }

    // when the user stops scrolling, snap to the closest item.
    ScrollTrigger.addEventListener("scrollEnd", () =>
      scrollToOffset(scrub.vars.offset)
    );

    // feed in an offset (like a time on the seamlessLoop timeline, but it can exceed 0 and duration() in either direction; it'll wrap) and it'll set the scroll position accordingly. That'll call the onUpdate() on the trigger if there's a change.
    function scrollToOffset(offset: number) {
      // moves the scroll playhead to the place that corresponds to the totalTime value of the seamlessLoop, and wraps if necessary.
      const snappedTime = snapTime(offset);
      const progress =
        (snappedTime - seamlessLoop.duration() * scrubber.iteration) /
        seamlessLoop.duration();
      const scroll = progressToScroll(progress);
      if (progress >= 1 || progress < 0) {
        return wrap(Math.floor(progress), scroll);
      }
      trigger.scroll(scroll);
    }

    document
      .querySelector(".next")
      .addEventListener("click", () =>
        scrollToOffset(scrub.vars.offset + spacing)
      );
    document
      .querySelector(".prev")
      .addEventListener("click", () =>
        scrollToOffset(scrub.vars.offset - spacing)
      );

    function buildSeamlessLoop(items, spacing, animateFunc) {
      let rawSequence = gsap.timeline({ paused: true }), // this is where all the "real" animations live
        seamlessLoop = gsap.timeline({
          // this merely scrubs the playhead of the rawSequence so that it appears to seamlessly loop
          paused: true,
          repeat: -1, // to accommodate infinite scrolling/looping
          onRepeat() {
            // works around a super rare edge case bug that's fixed GSAP 3.6.1
            this._time === this._dur && (this._tTime += this._dur - 0.01);
          },
          onReverseComplete() {
            this.totalTime(this.rawTime() + this.duration() * 100); // seamless looping backwards
          },
        }),
        cycleDuration = spacing * items.length,
        dur; // the duration of just one animateFunc() (we'll populate it in the .forEach() below...

      // loop through 3 times so we can have an extra cycle at the start and end - we'll scrub the playhead only on the 2nd cycle
      items
        .concat(items)
        .concat(items)
        .forEach((item, i) => {
          let anim = animateFunc(items[i % items.length]);
          rawSequence.add(anim, i * spacing);
          dur || (dur = anim.duration());
        });

      // animate the playhead linearly from the start of the 2nd cycle to its end (so we'll have one "extra" cycle at the beginning and end)
      seamlessLoop.fromTo(
        rawSequence,
        {
          time: cycleDuration + dur / 2,
        },
        {
          time: "+=" + cycleDuration,
          duration: cycleDuration,
          ease: "none",
        }
      );
      return seamlessLoop;
    }

    scrubber.draggable();

    // if you want a more efficient timeline, but it's a bit more complex to follow the code, use this function instead...
    // function buildSeamlessLoop(items, spacing, animateFunc) {
    // 	let overlap = Math.ceil(1 / spacing), // number of EXTRA animations on either side of the start/end to accommodate the seamless looping
    // 		startTime = items.length * spacing + 0.5, // the time on the rawSequence at which we'll start the seamless loop
    // 		loopTime = (items.length + overlap) * spacing + 1, // the spot at the end where we loop back to the startTime
    // 		rawSequence = gsap.timeline({paused: true}), // this is where all the "real" animations live
    // 		seamlessLoop = gsap.timeline({ // this merely scrubs the playhead of the rawSequence so that it appears to seamlessly loop
    // 			paused: true,
    // 			repeat: -1, // to accommodate infinite scrolling/looping
    // 			onRepeat() { // works around a super rare edge case bug that's fixed GSAP 3.6.1
    // 				this._time === this._dur && (this._tTime += this._dur - 0.01);
    // 			}
    // 		}),
    // 		l = items.length + overlap * 2,
    // 		time, i, index;
    //
    // 	// now loop through and create all the animations in a staggered fashion. Remember, we must create EXTRA animations at the end to accommodate the seamless looping.
    // 	for (i = 0; i < l; i++) {
    // 		index = i % items.length;
    // 		time = i * spacing;
    // 		rawSequence.add(animateFunc(items[index]), time);
    // 		i <= items.length && seamlessLoop.add("label" + i, time); // we don't really need these, but if you wanted to jump to key spots using labels, here ya go.
    // 	}
    //
    // 	// here's where we set up the scrubbing of the playhead to make it appear seamless.
    // 	rawSequence.time(startTime);
    // 	seamlessLoop.to(rawSequence, {
    // 		time: loopTime,
    // 		duration: loopTime - startTime,
    // 		ease: "none"
    // 	}).fromTo(rawSequence, {time: overlap * spacing + 1}, {
    // 		time: startTime,
    // 		duration: startTime - (overlap * spacing + 1),
    // 		immediateRender: false,
    // 		ease: "none"
    // 	});
    // 	return seamlessLoop;
    // }
  }, []);
  return (
    <div className="Picker">
      <div className="gallery">
        <ul className="cards">
          <li>0</li>
          <li>1</li>
          <li>2</li>
          <li>3</li>
          <li>4</li>
          <li>5</li>
          <li>6</li>
          <li>7</li>
          <li>8</li>
          <li>9</li>
          <li>10</li>
          <li>11</li>
          <li>12</li>
          <li>13</li>
          <li>14</li>
          <li>15</li>
          <li>16</li>
          <li>17</li>
          <li>18</li>
          <li>19</li>
          <li>20</li>
          <li>21</li>
          <li>22</li>
          <li>23</li>
          <li>24</li>
          <li>25</li>
          <li>26</li>
          <li>27</li>
          <li>28</li>
          <li>29</li>
          <li>30</li>
        </ul>
        <section className={"hitter"} />
        <div className="actions">
          <button className="prev">Prev</button>
          <button className="next">Next</button>
        </div>
      </div>
      <div className="drag-proxy" />
    </div>
  );
}
