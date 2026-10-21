import { UFS, type AddressForm, type FieldErrors } from '../congregations/form';
import { Field } from './Field';
import { fieldClass } from './styles';

/** Os campos de endereço (opcionais), usados no cadastro de congregações e de membros. */
export function AddressFields({
  address,
  errors,
  onChange,
}: {
  address: AddressForm;
  errors: FieldErrors;
  onChange: (field: keyof AddressForm, value: string) => void;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-base font-semibold">Endereço</legend>
      <p className="text-sm text-slate-600">
        Opcional. Se preencher algum campo, informe rua, cidade e estado.
      </p>
      <Field id="street" label="Rua" error={errors['address.street']}>
        {(props) => (
          <input
            {...props}
            type="text"
            autoComplete="off"
            value={address.street}
            onChange={(e) => onChange('street', e.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="number" label="Número" error={errors['address.number']}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={address.number}
              onChange={(e) => onChange('number', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field
          id="complement"
          label="Complemento"
          error={errors['address.complement']}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={address.complement}
              onChange={(e) => onChange('complement', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
      </div>
      <Field id="district" label="Bairro" error={errors['address.district']}>
        {(props) => (
          <input
            {...props}
            type="text"
            value={address.district}
            onChange={(e) => onChange('district', e.target.value)}
            className={fieldClass}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
        <Field id="city" label="Cidade" error={errors['address.city']}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={address.city}
              onChange={(e) => onChange('city', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field id="state" label="Estado" error={errors['address.state']}>
          {(props) => (
            <select
              {...props}
              value={address.state}
              onChange={(e) => onChange('state', e.target.value)}
              className={fieldClass}
            >
              <option value="">Escolher</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="postalCode" label="CEP" error={errors['address.postalCode']}>
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              value={address.postalCode}
              onChange={(e) => onChange('postalCode', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
      </div>
    </fieldset>
  );
}
