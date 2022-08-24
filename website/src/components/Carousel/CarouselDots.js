import React from "react";

function CarouselDots({ number, currentIndex }) {
  const Dots = [];
  for (let index = 0; index < number; index++) {
    if (currentIndex === index) {
      Dots.push(<CarouselDot selected key={index} />);
    } else {
      Dots.push(<CarouselDot key={index} />);
    }
  }
  return <>{Dots}</>;
}

function CarouselDot({ selected }) {
  if (selected) {
    return <div className="h-2 w-2 rounded-full bg-gray-50"></div>;
  } else {
    return (
      <div className="h-2 w-2 cursor-pointer rounded-full border border-gray-50"></div>
    );
  }
}

export default CarouselDots;
