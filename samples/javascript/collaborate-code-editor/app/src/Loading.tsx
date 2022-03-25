import { Spinner } from "react-bootstrap";

export function Loading(props: { isLoading: boolean; username: string }) {
  return (
    <div className={props.isLoading ? "loading" : "loading hide"}>
      <Spinner
        as="span"
        animation="border"
        size="sm"
        role="status"
        aria-hidden="true"
      />
      <span className="spinner-text">
        {props.username ? "Connecting..." : "Negotiating..."}
      </span>
    </div>
  );
}