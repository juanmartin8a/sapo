import type { Ref } from "react";
import PagerView, {
    type PagerViewOnPageScrollEventData,
    type PagerViewProps,
} from "react-native-pager-view";
import Animated, { type SharedValue, useEvent } from "react-native-reanimated";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

export type HomePagerHandle = PagerView;

type HomePagerProps = PagerViewProps & {
    ref?: Ref<HomePagerHandle>;
    progress: SharedValue<number>;
};

export default function HomePager({ ref, progress, ...props }: HomePagerProps) {
    const handlePageScroll = useEvent<PagerViewOnPageScrollEventData>(
        (event) => {
            "worklet";
            progress.set(Math.max(0, Math.min(1, event.position + event.offset)));
        },
        ["onPageScroll"]
    );
    // Reanimated delivers the flattened native payload, while PagerView types the React wrapper event.
    const animatedPageScrollHandler = handlePageScroll as unknown as PagerViewProps["onPageScroll"];

    return <AnimatedPagerView {...props} ref={ref} onPageScroll={animatedPageScrollHandler} />;
}
