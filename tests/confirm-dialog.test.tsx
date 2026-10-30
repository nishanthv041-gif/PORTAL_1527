import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmDialogProvider, useConfirm } from "../frontend/components/ui/ConfirmDialog";

// Test Consumer component
function TestConsumer({
  onResult,
  options
}: {
  onResult?: (res: boolean) => void;
  options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "primary" | "warning";
    requireText?: string;
    onConfirm?: () => Promise<void> | void;
  };
}) {
  const confirm = useConfirm();

  return (
    <div>
      <button
        data-testid="trigger-btn"
        onClick={async () => {
          const res = await confirm(options);
          if (onResult) onResult(res);
        }}
      >
        Trigger Confirm
      </button>
    </div>
  );
}

describe("ConfirmDialog System", () => {
  it("throws error when useConfirm is used outside of ConfirmDialogProvider", () => {
    // Suppress React error boundary console log for this test
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    function BadComponent() {
      useConfirm();
      return <div>Bad</div>;
    }

    expect(() => render(<BadComponent />)).toThrow(
      "useConfirm must be used within a ConfirmDialogProvider"
    );

    consoleError.mockRestore();
  });

  it("renders trigger and does not display dialog initially", () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer
          options={{
            title: "Delete Item?",
            message: "Are you sure?"
          }}
        />
      </ConfirmDialogProvider>
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByTestId("trigger-btn")).toBeDefined();
  });

  it("opens danger confirmation dialog and resolves false when Cancel is clicked", async () => {
    const handleResult = vi.fn();

    render(
      <ConfirmDialogProvider>
        <TestConsumer
          onResult={handleResult}
          options={{
            title: "Delete Class 10?",
            message: "This cannot be undone.",
            confirmText: "Delete",
            cancelText: "Cancel",
            variant: "danger"
          }}
        />
      </ConfirmDialogProvider>
    );

    // Trigger dialog
    fireEvent.click(screen.getByTestId("trigger-btn"));

    // Check dialog rendered in document
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeDefined();
    expect(screen.getByText("Delete Class 10?")).toBeDefined();
    expect(screen.getByText("This cannot be undone.")).toBeDefined();

    // Click Cancel
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(handleResult).toHaveBeenCalledWith(false);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("resolves true when Confirm button is clicked", async () => {
    const handleResult = vi.fn();

    render(
      <ConfirmDialogProvider>
        <TestConsumer
          onResult={handleResult}
          options={{
            title: "Publish All Timetables?",
            message: "Timetable will be visible to all parents and teachers.",
            confirmText: "Publish",
            cancelText: "Cancel",
            variant: "primary"
          }}
        />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByTestId("trigger-btn"));

    const confirmBtn = await screen.findByRole("button", { name: "Publish" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleResult).toHaveBeenCalledWith(true);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("supports requireText and requires matching string before confirming", async () => {
    const handleResult = vi.fn();

    render(
      <ConfirmDialogProvider>
        <TestConsumer
          onResult={handleResult}
          options={{
            title: "Delete Subject Permanently?",
            message: "Type DELETE to confirm.",
            confirmText: "Delete Subject",
            variant: "danger",
            requireText: "DELETE"
          }}
        />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByTestId("trigger-btn"));

    const confirmBtn = await screen.findByRole("button", { name: "Delete Subject" });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    const input = screen.getByPlaceholderText("DELETE");
    fireEvent.change(input, { target: { value: "WRONG" } });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.change(input, { target: { value: "DELETE" } });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleResult).toHaveBeenCalledWith(true);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("handles async onConfirm and displays error message on failure", async () => {
    const mockAsyncFail = vi.fn().mockRejectedValue(new Error("Database connection timed out"));
    const handleResult = vi.fn();

    render(
      <ConfirmDialogProvider>
        <TestConsumer
          onResult={handleResult}
          options={{
            title: "Execute Action",
            message: "Will fail asynchronously.",
            onConfirm: mockAsyncFail
          }}
        />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByTestId("trigger-btn"));

    const confirmBtn = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    // Expect error message displayed in dialog
    const errorMsg = await screen.findByText("Database connection timed out");
    expect(errorMsg).toBeDefined();

    // Dialog stays open so user can retry or cancel
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(handleResult).not.toHaveBeenCalled();

    // Clicking cancel closes and resolves false
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(handleResult).toHaveBeenCalledWith(false);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });
});
