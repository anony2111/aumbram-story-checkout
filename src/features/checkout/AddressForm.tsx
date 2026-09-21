"use client";

import { useId } from "react";
import styles from "./checkout.module.css";
import { useTranslator } from "@/i18n/client";
import type { AddressErrors, AddressField, AddressFormValues } from "./payload";
import type { MessageKey } from "@/i18n/messages/en";
import type { Translator } from "@/i18n/translate";

/**
 * The address form.
 *
 * Input types are chosen for the keyboard they summon on a phone, not for
 * validation: `inputmode="numeric"` on the pincode and phone puts a keypad under
 * the thumb instead of a QWERTY layout. Validation is ours, in `payload.ts`,
 * because the browser's is neither Indian nor translatable.
 *
 * Nothing here is persisted. The brief allows it with a justification; the
 * justification would have to cover a name, a phone number and a home address
 * sitting in `localStorage` on a phone that gets handed around, and for a demo
 * with one fixed user there is nothing on the other side of that trade.
 */

export interface AddressFormProps {
  values: AddressFormValues;
  errors: AddressErrors;
  /** Only fields the shopper has left are shown as invalid before submitting. */
  touched: Partial<Record<AddressField, boolean>>;
  onChange: (field: AddressField, value: string) => void;
  onBlur: (field: AddressField) => void;
  fieldRefs: Partial<Record<AddressField, (element: HTMLInputElement | null) => void>>;
}

export function AddressForm({
  values,
  errors,
  touched,
  onChange,
  onBlur,
  fieldRefs,
}: AddressFormProps) {
  const t = useTranslator();
  const idPrefix = useId();

  const field = (
    name: AddressField,
    labelKey: MessageKey,
    input: {
      type?: string;
      inputMode?: "text" | "numeric" | "tel";
      autoComplete: string;
      maxLength?: number;
      hintKey?: MessageKey;
    }
  ) => (
    <Field
      key={name}
      idPrefix={idPrefix}
      name={name}
      label={t(labelKey)}
      value={values[name]}
      error={touched[name] ? errors[name] : undefined}
      errorText={
        touched[name] && errors[name]
          ? t(errors[name], { field: t(labelKey) })
          : undefined
      }
      hint={input.hintKey ? t(input.hintKey) : undefined}
      onChange={(value) => onChange(name, value)}
      onBlur={() => onBlur(name)}
      registerRef={fieldRefs[name]}
      t={t}
      {...input}
    />
  );

  return (
    <div>
      {field("name", "checkout.name", { autoComplete: "name" })}

      {field("phone", "checkout.phone", {
        type: "tel",
        inputMode: "numeric",
        autoComplete: "tel-national",
        maxLength: 13,
        hintKey: "checkout.phoneHint",
      })}

      {field("line1", "checkout.line1", { autoComplete: "address-line1" })}
      {field("line2", "checkout.line2", { autoComplete: "address-line2" })}

      <div className={styles.fieldRow}>
        {field("city", "checkout.city", { autoComplete: "address-level2" })}
        {field("state", "checkout.state", { autoComplete: "address-level1" })}
      </div>

      {field("pincode", "checkout.pincode", {
        inputMode: "numeric",
        autoComplete: "postal-code",
        maxLength: 6,
      })}
    </div>
  );
}

function Field({
  idPrefix,
  name,
  label,
  value,
  error,
  errorText,
  hint,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  onChange,
  onBlur,
  registerRef,
}: {
  idPrefix: string;
  name: AddressField;
  label: string;
  value: string;
  error: MessageKey | undefined;
  errorText: string | undefined;
  hint?: string | undefined;
  type?: string;
  inputMode?: "text" | "numeric" | "tel";
  autoComplete: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onBlur: () => void;
  registerRef?: ((element: HTMLInputElement | null) => void) | undefined;
  t: Translator;
}) {
  const inputId = `${idPrefix}-${name}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  // Both the hint and the error are announced with the field, in that order.
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        ref={registerRef}
        className={error ? styles.inputInvalid : styles.input}
        type={type}
        {...(inputMode ? { inputMode } : {})}
        autoComplete={autoComplete}
        {...(maxLength ? { maxLength } : {})}
        value={value}
        aria-invalid={error ? true : undefined}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
        data-field={name}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {hint ? (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className={styles.error} id={errorId} role="alert" data-testid={`error-${name}`}>
          {errorText}
        </span>
      ) : null}
    </div>
  );
}
