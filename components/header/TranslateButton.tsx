import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
// Import your SVG icon components. They might come from a library like react-native-svg.
import ArrowRightIcon  from "../../assets/icons/arrow-right.svg";
import SquareIcon from "../../assets/icons/square.svg";
import MoreHorizontalIcon from "../../assets/icons/more-horizontal.svg";
import useTranslateButtonStateNotifier from '@/stores/translateButtonStateNotifier';

const TranslateButton = ({ style }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  const translateButtonState = useTranslateButtonStateNotifier((state) => state.state)

  // Trigger animation on state change.
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 500, // Adjust the duration as needed.
      useNativeDriver: true,
    }).start();
  }, [translateButtonState]);

  // Choose the appropriate icon.
  let component;
  switch (translateButtonState) {
    case 'next':
      component = //<Text style={styles.text}>...</Text>;
<ArrowRightIcon width={32} height={32} stroke="black" />
// <MoreHorizontalIcon width={24} height={24} stroke="black" />
      break;
    case 'loading':
      component = <MoreHorizontalIcon width={24} height={24} stroke="black" />
      break;
    case 'stop':
      component = <SquareIcon width={18} height={18} stroke="black" fill="black" />
      break;
    default:
      return null;
  }

  return (
    <Animated.View style={[style, { opacity }]}>
      {component}
    </Animated.View>
  );
};

export default TranslateButton
