import { Container, Nav, Navbar, NavDropdown } from "react-bootstrap";

export function Navigator(props: {
  username: string;
  language: string;
  setLanguage: (arg0: string) => void;
}) {
  const supportLanguages = [
    "Python",
    "JavaScript",
    "TypeScript",
    "Java",
    "Golang",
  ];

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container>
        <Navbar.Brand>CodeStream</Navbar.Brand>
          {/*
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <NavDropdown
              title={props.language}
              id="basic-nav-dropdown"
              menuVariant="dark"
            >
              {supportLanguages.map(function (text, i) {
                return (
                  <NavDropdown.Item
                    key={text}
                    onClick={() => props.setLanguage(text)}
                  >
                    {text}
                  </NavDropdown.Item>
                );
              })}
            </NavDropdown>
          </Nav>
          <Navbar.Text>
            {props.username ? `${props.username}` : "Disconnected"}
          </Navbar.Text>
        </Navbar.Collapse>
          */}
      </Container>
    </Navbar>
  );
}
