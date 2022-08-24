import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";

import Carousel from "../components/Carousel/Carousel";
import Tagline from "../components/HomePage/Tagline";
import Democards from "../components/HomePage/Democards";
import Footer from "../components/Common/Footer";

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Description will go into a meta tag in <head />"
    >
      <div className="w-screen overflow-hidden">
        <Carousel />
        <Tagline />

        <div className="mb-10 flex justify-center">
          <Democards />
        </div>

        <Footer />
      </div>
    </Layout>
  );
}
